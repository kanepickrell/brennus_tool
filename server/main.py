# server/main.py
# FastAPI backend for Operator - handles Robot execution, C2, and LLM proxy
# All Ollama calls happen here. Frontend never talks to Ollama directly.

import asyncio
import subprocess
import sys
import os
import json
import uuid
import httpx
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# PTY support - Unix only
PTY_AVAILABLE = False
if sys.platform != "win32":
    try:
        import pty
        import fcntl
        import termios
        import select
        import struct
        PTY_AVAILABLE = True
    except ImportError:
        pass

if not PTY_AVAILABLE:
    print("Note: PTY not available (Windows or missing modules). Using subprocess fallback.")

# Import our mock C2 library
try:
    from cobaltstrike import (
        start_c2, stop_c2, is_connected, get_teamserver_info,
        create_listener, list_listeners,
        create_payload, list_payloads,
        get_status as get_c2_status, reset as reset_c2
    )
    C2_AVAILABLE = True
except ImportError:
    C2_AVAILABLE = False
    print("Warning: cobaltstrike module not found")


# =============================================================================
# LLM Configuration
# =============================================================================

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://10.10.80.99:4001")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:27b-it-qat")

MODULE_ASSISTANT_SYSTEM_PROMPT = """You are the Operator module assistant for the 318th RANS cyber range red team.
You help operators find and create attack modules for adversary emulation campaigns.

When the operator asks a QUESTION about a tactic, technique, or tool (e.g., "What options do I have to run mimikatz?", "How about credential dumping with koadic c2?"):
1. Answer the question directly and concisely — describe the technique, relevant options, and MITRE ATT&CK technique ID(s)
2. Keep it actionable: mention specific tools, commands, or approaches they could use
3. Do NOT offer to build a module or search the library — the UI handles that separately

When the operator describes a capability (not as a question), you:
1. Identify the relevant MITRE ATT&CK technique(s) and tactic
2. Describe what the capability does concisely
3. Suggest a specific implementation approach

When the operator is just chatting or asking general questions, respond naturally and conversationally.

RESPONSE RULES:
- Keep responses concise: 1-3 sentences for tactical queries, conversational for chat
- Be direct and tactical, no fluff
- Reference MITRE ATT&CK technique IDs when relevant (e.g., T1003.001)
- Do NOT output JSON or code blocks unless explicitly asked
- Do NOT use markdown headers, bold, or excessive formatting
- Do NOT say "Would you like me to build a module for this?" — the UI provides those controls
- Speak like a fellow operator, not a textbook"""


# =============================================================================
# App Configuration
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("🚀 Operator API Server starting...")
    print(f"   C2 Library: {'Available' if C2_AVAILABLE else 'Not Found'}")
    print(f"   Robot Framework: {check_robot_installed()}")
    print(f"   Ollama: {OLLAMA_HOST} ({OLLAMA_MODEL})")
    print(f"   Local module data: {DATA_DIR} ({'exists' if DATA_DIR.exists() else 'NOT FOUND'})")
    if DATA_DIR.exists():
        count = len(list(DATA_DIR.glob("*.json")))
        print(f"   Module JSON files: {count}")

    # Check Ollama connectivity
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_HOST}/api/tags")
            if resp.status_code == 200:
                print(f"   ✓ Ollama connected")
            else:
                print(f"   ⚠️ Ollama returned {resp.status_code}")
    except Exception as e:
        print(f"   ⚠️ Ollama not reachable: {e}")

    yield
    print("👋 Operator API Server shutting down...")
    if C2_AVAILABLE:
        reset_c2()


app = FastAPI(
    title="Operator API",
    description="Backend API for Operator Campaign Studio",
    version="1.2.0",
    lifespan=lifespan
)

# CORS - allow all origins in dev. Lock down for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Execution state tracking
_executions: Dict[str, Dict[str, Any]] = {}


# =============================================================================
# Models
# =============================================================================

class RobotExecutionRequest(BaseModel):
    script_content: str
    script_name: Optional[str] = "workflow.robot"
    working_dir: Optional[str] = None
    variables: Optional[Dict[str, str]] = None


class C2ConnectRequest(BaseModel):
    host: str
    port: int
    user: str
    password: str
    cs_dir: Optional[str] = "/opt/cobaltstrike"


class ListenerRequest(BaseModel):
    name: str
    port: int
    listener_type: str
    host: str
    bind_to: Optional[str] = None
    profile: Optional[str] = None


class PayloadRequest(BaseModel):
    name: str
    template: str
    listener: str
    output_dir: str
    retries: Optional[int] = 3
    arch: Optional[str] = "x64"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    """Chat request with conversation history"""
    message: str
    history: Optional[List[ChatMessage]] = []
    system_prompt: Optional[str] = None


class ModuleGenerateRequest(BaseModel):
    """Request to generate a module definition via LLM"""
    capability: str
    tactic: str
    tactic_id: str
    execution_type: str  # shell_command | cobalt_strike | robot_keyword | ssh_command


class CapabilityDescribeRequest(BaseModel):
    """Request to describe a capability in MITRE terms"""
    query: str


# =============================================================================
# LLM Helper
# =============================================================================

async def call_ollama(messages: List[dict], timeout: float = 90.0) -> str:
    """
    Single place where all Ollama calls happen.
    Returns the reply text or raises HTTPException.
    """
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.post(
                f"{OLLAMA_HOST}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": messages,
                    "stream": False,
                }
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Ollama returned {resp.status_code}: {resp.text[:200]}"
                )
            data = resp.json()
            return data.get("message", {}).get("content", "") or data.get("response", "")

        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Ollama request timed out")
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail=f"Cannot reach Ollama at {OLLAMA_HOST}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LLM call failed: {str(e)}")


# =============================================================================
# LLM Endpoints
# =============================================================================

@app.get("/api/chat/status")
async def chat_status():
    """Check if the LLM is available"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_HOST}/api/tags")
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                model_names = [m.get("name", "") for m in models]
                return {
                    "available": True,
                    "host": OLLAMA_HOST,
                    "model": OLLAMA_MODEL,
                    "model_loaded": any(OLLAMA_MODEL in n for n in model_names),
                    "models": model_names[:10],
                }
    except Exception:
        pass
    return {
        "available": False,
        "host": OLLAMA_HOST,
        "model": OLLAMA_MODEL,
    }


@app.post("/api/chat")
async def chat_with_llm(request: ChatRequest):
    """
    General conversational chat. The frontend sends message + history,
    backend proxies to Ollama with system prompt.
    """
    messages = [
        {"role": "system", "content": request.system_prompt or MODULE_ASSISTANT_SYSTEM_PROMPT}
    ]
    if request.history:
        for msg in request.history:
            messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})

    reply = await call_ollama(messages)
    return {"reply": reply, "model": OLLAMA_MODEL}


@app.post("/api/chat/describe")
async def describe_capability(request: CapabilityDescribeRequest):
    """
    Given a capability description, return a 1-sentence MITRE-tagged description.
    Used by the module assistant before elicitation.
    """
    messages = [
        {"role": "system", "content": MODULE_ASSISTANT_SYSTEM_PROMPT},
        {"role": "user", "content": (
            f'The operator needs: "{request.query}"\n\n'
            'In 1 sentence, describe this capability and the MITRE ATT&CK technique ID. No JSON.'
        )},
    ]
    reply = await call_ollama(messages, timeout=60.0)
    return {"description": reply, "model": OLLAMA_MODEL}


@app.post("/api/chat/generate-module")
async def generate_module(request: ModuleGenerateRequest):
    """
    Generate a structured module definition via LLM.
    Returns NAME, RISK, COMMAND, PARAMS, DESCRIPTION fields.
    """
    prompt = (
        f'Generate a module for: "{request.capability}"\n'
        f'Tactic: {request.tactic}, Execution: {request.execution_type}\n\n'
        'Reply in EXACTLY this format (no markdown, no extra text):\n'
        'NAME: <3-5 word module name>\n'
        'RISK: <low|medium|high|critical>\n'
        'COMMAND: <command template using ${PARAM_NAME} for variables>\n'
        'PARAMS: <comma-separated parameter names>\n'
        'DESCRIPTION: <1 sentence>'
    )
    messages = [
        {"role": "system", "content": MODULE_ASSISTANT_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    reply = await call_ollama(messages, timeout=90.0)
    return {"raw": reply, "model": OLLAMA_MODEL}


# =============================================================================
# Infrastructure Status
# =============================================================================

def check_robot_installed() -> str:
    """Check if Robot Framework is installed"""
    try:
        import robot.version
        return f"Installed (Robot Framework {robot.version.VERSION})"
    except ImportError:
        return "Not installed"


@app.get("/api/infrastructure/status")
async def get_infrastructure_status():
    """Get status of all infrastructure components"""
    robot_status = check_robot_installed()
    robot_available = "Installed" in robot_status
    c2_status = get_c2_status() if C2_AVAILABLE else {"connected": False}

    llm_available = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_HOST}/api/tags")
            llm_available = resp.status_code == 200
    except Exception:
        pass

    return {
        "robot_framework": {
            "available": robot_available,
            "status": robot_status,
            "executable": sys.executable
        },
        "cobalt_strike": {
            "available": C2_AVAILABLE,
            "connected": c2_status.get("connected", False),
            "teamserver": c2_status.get("teamserver"),
            "listeners": c2_status.get("listeners", 0),
            "payloads": c2_status.get("payloads", 0)
        },
        "llm": {
            "available": llm_available,
            "host": OLLAMA_HOST,
            "model": OLLAMA_MODEL,
        },
        "python": {
            "version": sys.version,
            "executable": sys.executable
        }
    }


# =============================================================================
# C2 Management Endpoints
# =============================================================================

@app.post("/api/c2/connect")
async def connect_c2(request: C2ConnectRequest):
    if not C2_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2 library not available")
    try:
        result = start_c2(host=request.host, port=request.port, user=request.user, password=request.password, cs_dir=request.cs_dir)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/c2/disconnect")
async def disconnect_c2():
    if not C2_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2 library not available")
    result = stop_c2()
    return {"success": True, "data": result}


@app.get("/api/c2/status")
async def c2_status():
    if not C2_AVAILABLE:
        return {"available": False, "connected": False}
    return {
        "available": True,
        "connected": is_connected(),
        "info": get_teamserver_info() if is_connected() else None
    }


@app.get("/api/c2/listeners")
async def get_listeners():
    if not C2_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2 library not available")
    return {"listeners": list_listeners()}


@app.post("/api/c2/listeners")
async def add_listener(request: ListenerRequest):
    if not C2_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2 library not available")
    try:
        result = create_listener(name=request.name, port=request.port, listener_type=request.listener_type, host=request.host, bind_to=request.bind_to, profile=request.profile)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/c2/payloads")
async def get_payloads():
    if not C2_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2 library not available")
    return {"payloads": list_payloads()}


@app.post("/api/c2/payloads")
async def generate_payload(request: PayloadRequest):
    if not C2_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2 library not available")
    try:
        path = create_payload(name=request.name, template=request.template, listener=request.listener, output_dir=request.output_dir, retries=request.retries, arch=request.arch)
        return {"success": True, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Robot Framework Execution
# =============================================================================

@app.post("/api/robot/execute")
async def execute_robot(request: RobotExecutionRequest, background_tasks: BackgroundTasks):
    execution_id = str(uuid.uuid4())
    import tempfile
    base_tmp = Path(tempfile.gettempdir()) / "operator_robot"
    work_dir = base_tmp / execution_id
    work_dir.mkdir(parents=True, exist_ok=True)
    script_path = work_dir / request.script_name
    script_path.write_text(request.script_content)
    _executions[execution_id] = {
        "id": execution_id, "status": "pending", "script_path": str(script_path),
        "started_at": datetime.now().isoformat(), "completed_at": None,
        "output": [], "return_code": None, "error": None
    }
    background_tasks.add_task(run_robot_script, execution_id, script_path, work_dir, request.variables)
    return {"execution_id": execution_id, "status": "started", "script_path": str(script_path)}


async def run_robot_script(execution_id: str, script_path: Path, work_dir: Path, variables: Optional[Dict[str, str]] = None):
    _executions[execution_id]["status"] = "running"
    cmd = [sys.executable, "-m", "robot", "--outputdir", str(work_dir / "output"), "--consolecolors", "off"]
    if variables:
        for key, value in variables.items():
            cmd.extend(["--variable", f"{key}:{value}"])
    cmd.append(str(script_path))
    try:
        process = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, cwd=str(work_dir))
        output_lines = []
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            decoded = line.decode().rstrip()
            output_lines.append(decoded)
            _executions[execution_id]["output"] = output_lines
        await process.wait()
        _executions[execution_id]["return_code"] = process.returncode
        _executions[execution_id]["status"] = "completed" if process.returncode == 0 else "failed"
        _executions[execution_id]["completed_at"] = datetime.now().isoformat()
    except Exception as e:
        _executions[execution_id]["status"] = "error"
        _executions[execution_id]["error"] = str(e)
        _executions[execution_id]["completed_at"] = datetime.now().isoformat()


@app.get("/api/robot/execution/{execution_id}")
async def get_execution_status(execution_id: str):
    if execution_id not in _executions:
        raise HTTPException(status_code=404, detail="Execution not found")
    return _executions[execution_id]


@app.get("/api/robot/execution/{execution_id}/stream")
async def stream_execution_output(execution_id: str):
    if execution_id not in _executions:
        raise HTTPException(status_code=404, detail="Execution not found")

    async def generate():
        last_index = 0
        while True:
            execution = _executions.get(execution_id)
            if not execution:
                break
            output = execution.get("output", [])
            while last_index < len(output):
                yield f"data: {json.dumps({'type': 'output', 'line': output[last_index]})}\n\n"
                last_index += 1
            if execution["status"] in ("completed", "failed", "error"):
                yield f"data: {json.dumps({'type': 'complete', 'status': execution['status'], 'return_code': execution.get('return_code')})}\n\n"
                break
            await asyncio.sleep(0.1)

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


@app.get("/api/robot/executions")
async def list_executions():
    return {"executions": list(_executions.values())}


# =============================================================================
# Health Check
# =============================================================================

@app.get("/api/health")
async def health_check():
    llm_ok = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_HOST}/api/tags")
            llm_ok = resp.status_code == 200
    except Exception:
        pass

    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "c2": C2_AVAILABLE and is_connected() if C2_AVAILABLE else False,
            "robot": "Installed" in check_robot_installed(),
            "pty": PTY_AVAILABLE,
            "llm": llm_ok,
        }
    }


# =============================================================================
# WebSocket Terminal
# =============================================================================

_terminal_sessions: Dict[str, Dict[str, Any]] = {}


class TerminalRequest(BaseModel):
    script_content: str
    script_name: Optional[str] = "workflow.robot"
    working_dir: Optional[str] = None


@app.post("/api/terminal/create")
async def create_terminal_session(request: TerminalRequest):
    session_id = str(uuid.uuid4())
    import tempfile, shutil
    base_tmp = Path(tempfile.gettempdir()) / "operator_robot"
    work_dir = base_tmp / session_id
    work_dir.mkdir(parents=True, exist_ok=True)
    server_dir = Path(__file__).parent

    # Copy cobaltstrike mock library (flat)
    cs_lib_source = server_dir / "cobaltstrike.py"
    if cs_lib_source.exists():
        shutil.copy(cs_lib_source, work_dir / "cobaltstrike.py")

    # Copy cobaltstrikec2 directory
    cs_dir_source = server_dir / "cobaltstrikec2"
    if cs_dir_source.exists():
        shutil.copytree(cs_dir_source, work_dir / "cobaltstrikec2", dirs_exist_ok=True)

    # Copy all .resource files
    for resource_file in server_dir.glob("*.resource"):
        shutil.copy(resource_file, work_dir / resource_file.name)

    script_path = work_dir / request.script_name
    script_content = request.script_content
    script_content = script_content.replace("Library             cobaltstrikec2/cobaltstrike.py", "Library             cobaltstrikec2/cobaltstrike.py")
    script_path.write_text(script_content)
    _terminal_sessions[session_id] = {"id": session_id, "script_path": str(script_path), "work_dir": str(work_dir), "status": "created", "created_at": datetime.now().isoformat()}
    return {"session_id": session_id, "script_path": str(script_path), "work_dir": str(work_dir)}


@app.websocket("/api/terminal/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session = _terminal_sessions.get(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return
    script_path = session["script_path"]
    work_dir = session["work_dir"]
    cmd = [sys.executable, "-m", "robot", "--consolecolors", "on", script_path]
    try:
        if PTY_AVAILABLE and sys.platform != "win32":
            await run_with_pty(websocket, cmd, work_dir)
        else:
            await run_with_subprocess(websocket, cmd, work_dir)
    except WebSocketDisconnect:
        print(f"Terminal {session_id}: Client disconnected")
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        _terminal_sessions[session_id]["status"] = "completed"


async def run_with_pty(websocket: WebSocket, cmd: List[str], work_dir: str):
    import pty, fcntl, termios, struct, select
    master_fd, slave_fd = pty.openpty()
    winsize = struct.pack('HHHH', 24, 80, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
    process = subprocess.Popen(cmd, stdin=slave_fd, stdout=slave_fd, stderr=slave_fd, cwd=work_dir, close_fds=True)
    os.close(slave_fd)
    flags = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    await websocket.send_json({"type": "started", "pid": process.pid})
    try:
        while process.poll() is None:
            r, _, _ = select.select([master_fd], [], [], 0.1)
            if master_fd in r:
                try:
                    data = os.read(master_fd, 4096)
                    if data:
                        await websocket.send_bytes(data)
                except OSError:
                    break
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
                data = json.loads(msg)
                if data.get("type") == "input":
                    os.write(master_fd, data["data"].encode())
                elif data.get("type") == "resize":
                    winsize = struct.pack('HHHH', data.get("rows", 24), data.get("cols", 80), 0, 0)
                    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
            except (asyncio.TimeoutError, Exception):
                pass
    finally:
        os.close(master_fd)
        process.terminate()
    await websocket.send_json({"type": "exit", "code": process.returncode})


async def run_with_subprocess(websocket: WebSocket, cmd: List[str], work_dir: str):
    try:
        await websocket.send_json({"type": "info", "message": "Starting Robot Framework..."})
        await websocket.send_json({"type": "info", "message": f"Command: {' '.join(cmd)}"})
    except Exception as e:
        print(f"Error sending initial info: {e}")
        return

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUNBUFFERED"] = "1"
    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=work_dir, env=env, bufsize=1, universal_newlines=True, encoding='utf-8', errors='replace')
        await websocket.send_json({"type": "started", "pid": process.pid})
        loop = asyncio.get_event_loop()

        def read_stdout():
            lines = []
            for line in process.stdout:
                lines.append(line)
            return lines

        def read_stderr():
            return process.stderr.read()

        stdout_lines_list = await loop.run_in_executor(None, read_stdout)
        for line in stdout_lines_list:
            await websocket.send_text(line)
        stderr_text = await loop.run_in_executor(None, read_stderr)
        if stderr_text:
            await websocket.send_text(f"\n[STDERR]:\n{stderr_text}\n")
        process.wait()
    except Exception as e:
        import traceback
        await websocket.send_json({"type": "error", "message": f"Process error: {str(e)}\n{traceback.format_exc()}"})
        return
    await websocket.send_json({"type": "exit", "code": process.returncode})


@app.delete("/api/terminal/{session_id}")
async def delete_terminal_session(session_id: str):
    if session_id in _terminal_sessions:
        _terminal_sessions.pop(session_id)
        return {"status": "deleted", "session_id": session_id}
    raise HTTPException(status_code=404, detail="Session not found")


# =============================================================================
# Quick Test
# =============================================================================

@app.post("/api/robot/test")
async def test_robot_execution():
    import tempfile
    base_tmp = Path(tempfile.gettempdir()) / "operator_test"
    work_dir = base_tmp / uuid.uuid4().hex[:8]
    work_dir.mkdir(parents=True, exist_ok=True)
    test_script = """*** Settings ***\nLibrary    Collections\n\n*** Test Cases ***\nHello World Test\n    Log    Hello from Operator Campaign Studio!\n    ${result}=    Evaluate    1 + 1\n    Should Be Equal As Numbers    ${result}    2\n"""
    script_path = work_dir / "test.robot"
    script_path.write_text(test_script)
    cmd = [sys.executable, "-m", "robot", "--outputdir", str(work_dir / "output"), "--consolecolors", "off", str(script_path)]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=str(work_dir))
        return {"success": result.returncode == 0, "return_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# Local Module Data Endpoints
# =============================================================================

DATA_DIR = Path(__file__).parent / "data"


@app.get("/api/library-modules")
async def get_library_modules(search: Optional[str] = None, limit: int = 500):
    """Serve module metadata list from local JSON files in server/data/"""
    modules = []

    if not DATA_DIR.exists():
        return {"modules": [], "total": 0}

    for json_file in sorted(DATA_DIR.glob("*.json")):
        try:
            data = json.loads(json_file.read_text())
            module = {
                "_key":              data.get("_key", json_file.stem),
                "id":                data.get("_key", json_file.stem),
                "name":              data.get("name", json_file.stem),
                "icon":              data.get("icon", "⚡"),
                "tactic":            data.get("tactic", "control"),
                "category":          data.get("category", "Cobalt Strike"),
                "subcategory":       data.get("subcategory", ""),
                "description":       data.get("description", ""),
                "riskLevel":         data.get("riskLevel", "medium"),
                "estimatedDuration": data.get("estimatedDuration", 30),
                "executionType":     data.get("executionType", "cobalt_strike"),
                "tags":              data.get("tags", []),
                "payload_url":       f"/api/ingest/payloads/{json_file.stem}.json",
            }

            if search:
                search_lower = search.lower()
                if not any(
                    search_lower in str(v).lower()
                    for v in [module["name"], module["description"],
                              module["tactic"], module["category"]]
                ):
                    continue

            modules.append(module)
        except Exception as e:
            print(f"Warning: Could not load {json_file.name}: {e}")
            continue

    return {"modules": modules[:limit], "total": len(modules)}


@app.get("/api/ingest/payloads/{module_key}.json")
async def get_module_payload(module_key: str):
    """Serve full payload JSON for a module from server/data/"""
    payload_path = DATA_DIR / f"{module_key}.json"

    if not payload_path.exists():
        raise HTTPException(status_code=404, detail=f"Payload not found: {module_key}")

    try:
        data = json.loads(payload_path.read_text())
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read payload: {e}")



# =============================================================================
# Campaign Persistence Endpoints
# =============================================================================

CAMPAIGNS_DIR = Path(__file__).parent / "campaigns"
CAMPAIGNS_DIR.mkdir(exist_ok=True)


class CampaignSaveRequest(BaseModel):
    name: str
    workflow: Dict[str, Any]


def _campaign_path(name: str) -> Path:
    """Sanitize campaign name and return its file path."""
    safe_name = "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip()
    return CAMPAIGNS_DIR / f"{safe_name}.lumen"


@app.get("/api/campaigns")
async def list_campaigns():
    """List all saved campaigns with metadata."""
    campaigns = []
    for f in sorted(CAMPAIGNS_DIR.glob("*.lumen"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text())
            meta = data.get("metadata", {})
            campaigns.append({
                "name":         meta.get("name", f.stem),
                "description":  meta.get("description", ""),
                "author":       meta.get("author", ""),
                "created":      meta.get("created", ""),
                "lastModified": meta.get("lastModified", ""),
                "tags":         meta.get("tags", []),
                "nodeCount":    len(data.get("nodes", [])),
                "edgeCount":    len(data.get("edges", [])),
            })
        except Exception as e:
            print(f"Warning: Could not read campaign {f.name}: {e}")
    return {"campaigns": campaigns, "total": len(campaigns)}


@app.post("/api/campaigns")
async def save_campaign(request: CampaignSaveRequest):
    """Save or update a campaign by name."""
    path = _campaign_path(request.name)
    try:
        path.write_text(json.dumps(request.workflow, indent=2))
        return {"status": "saved", "name": request.name, "path": str(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save campaign: {e}")


@app.get("/api/campaigns/{name}")
async def load_campaign(name: str):
    """Load a specific campaign by name."""
    path = _campaign_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Campaign not found: {name}")
    try:
        return json.loads(path.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load campaign: {e}")


@app.delete("/api/campaigns/{name}")
async def delete_campaign(name: str):
    """Delete a campaign by name."""
    path = _campaign_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Campaign not found: {name}")
    path.unlink()
    return {"status": "deleted", "name": name}


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=True)