# server/main.py
# FastAPI backend for Lumen Campaign Studio
# Teamserver is started/stopped deliberately via the Infrastructure tab — not on Lumen startup.

import asyncio
import subprocess
import sys
import os
import json
import uuid
import httpx
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field, ConfigDict


# PTY support - Unix only
PTY_AVAILABLE = False
if sys.platform != "win32":
    try:
        import pty, fcntl, termios, select, struct
        PTY_AVAILABLE = True
    except ImportError:
        pass

if not PTY_AVAILABLE:
    print("Note: PTY not available (Windows or missing modules). Using subprocess fallback.")

# ---------------------------------------------------------------------------
# Gap 1 fix: import from cobaltstrike_module (the shim) instead of a
# non-existent top-level 'cobaltstrike' module.
# ---------------------------------------------------------------------------
try:
    from cobaltstrike_module import (
        start_c2, stop_c2, is_connected, get_teamserver_info,
        create_listener, list_listeners,
        create_payload, list_payloads,
        get_status as get_c2_status, reset as reset_c2,
    )
    C2_AVAILABLE = True
except ImportError:
    C2_AVAILABLE = False
    print("Warning: cobaltstrike_module not found — C2 API endpoints disabled")

# ---------------------------------------------------------------------------
# Gap 2 fix: robot_script_builder injects CS credentials into generated
# .robot scripts before they are written to the temp working directory.
# ---------------------------------------------------------------------------
try:
    from robot_script_builder import inject_cs_settings
    SCRIPT_BUILDER_AVAILABLE = True
except ImportError:
    SCRIPT_BUILDER_AVAILABLE = False
    print("Warning: robot_script_builder not found — CS library args will not be injected")


# =============================================================================
# Configuration — tuneable via environment variables
# =============================================================================

OLLAMA_HOST  = os.getenv("OLLAMA_HOST",  "http://10.10.80.99:4001")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:27b-it-qat")

# Cobalt Strike install directory (teamserver binary lives here)
CS_DIR = os.getenv("CS_DIR", "/opt/cobaltstrike")

# Path to the cobaltstrikec2/ Robot Framework library directory.
# Set CS_LIBRARY_DIR to override — otherwise resolves automatically:
#   1. CS_LIBRARY_DIR env var
#   2. CS_DIR/cobaltstrikec2/
#   3. server/cobaltstrikec2/ (mock fallback)
CS_LIBRARY_DIR = os.path.expanduser(
    os.getenv("CS_LIBRARY_DIR", str(Path(CS_DIR) / "cobaltstrikec2"))
)

# C2 connection defaults (pre-fill the UI)
CS_IP   = os.getenv("CS_IP",   "")
CS_PASS = os.getenv("CS_PASS", "")
CS_USER = os.getenv("CS_USER", "operator")

# Teamserver process handle (global — survives requests)
_teamserver_proc: Optional[subprocess.Popen] = None
_teamserver_log_path: Optional[str] = None

MODULE_ASSISTANT_SYSTEM_PROMPT = """You are the Operator module assistant for the 318th RANS cyber range red team.
You help operators find and create attack modules for adversary emulation campaigns.

When the operator asks a QUESTION about a tactic, technique, or tool:
1. Answer directly and concisely — describe the technique, options, and MITRE ATT&CK technique ID(s)
2. Keep it actionable: specific tools, commands, or approaches
3. Do NOT offer to build a module — the UI handles that

RESPONSE RULES:
- 1-3 sentences for tactical queries, conversational for chat
- Direct and tactical, no fluff
- Reference MITRE technique IDs where relevant (e.g., T1003.001)
- No JSON, no markdown headers, no excessive formatting
- Speak like a fellow operator"""


# =============================================================================
# Robot executable resolver
# =============================================================================

def _robot_cmd() -> List[str]:
    """
    Return the correct command prefix to invoke Robot Framework.

    When frozen by PyInstaller, sys.executable points to the lumen binary
    itself — NOT Python. Calling [sys.executable, "-m", "robot", ...] would
    re-launch lumen and immediately fail with "address already in use".

    Resolution order (frozen builds only):
      1. robot binary on PATH  (shutil.which — respects exported PATH)
      2. Common fixed locations for robot binary
      3. system python3 + "-m robot"
    When NOT frozen (dev mode), sys.executable is the real Python — use normally.
    """
    if not getattr(sys, 'frozen', False):
        return [sys.executable, "-m", "robot"]

    robot_on_path = shutil.which("robot")
    if robot_on_path and Path(robot_on_path).exists():
        return [robot_on_path]

    for r in ["/home/bah/.local/bin/robot", "/usr/local/bin/robot", "/usr/bin/robot"]:
        if Path(r).exists():
            return [r]

    py_on_path = shutil.which("python3")
    if py_on_path and Path(py_on_path).exists():
        return [py_on_path, "-m", "robot"]

    for p in ["/usr/bin/python3", "/usr/local/bin/python3"]:
        if Path(p).exists():
            return [p, "-m", "robot"]

    return ["/usr/bin/python3", "-m", "robot"]


# =============================================================================
# Teamserver process helpers
# =============================================================================

def _is_teamserver_running() -> bool:
    try:
        r = subprocess.run(["pgrep", "-f", "teamserver"],
                           capture_output=True, text=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


def _get_teamserver_pid() -> Optional[int]:
    try:
        r = subprocess.run(["pgrep", "-f", "teamserver"],
                           capture_output=True, text=True, timeout=5)
        if r.returncode == 0:
            pids = [int(p) for p in r.stdout.strip().split() if p.strip().isdigit()]
            return pids[0] if pids else None
    except Exception:
        pass
    return None


def _launch_teamserver(ip: str, password: str, cs_dir: str) -> Dict[str, Any]:
    """
    Launch the CS teamserver as a detached background process.
    Requires NOPASSWD sudo for the teamserver binary, or Lumen running as root.
    stdout/stderr appended to /tmp/lumen_teamserver.log.
    """
    global _teamserver_proc, _teamserver_log_path

    ts_binary = Path(cs_dir) / "teamserver"
    if not ts_binary.exists():
        return {"success": False, "error": f"teamserver binary not found at {ts_binary}"}

    log_path = "/tmp/lumen_teamserver.log"
    _teamserver_log_path = log_path

    try:
        log_file = open(log_path, "a")
        log_file.write(f"\n\n=== Lumen teamserver launch {datetime.now().isoformat()} ===\n")
        log_file.flush()

        _teamserver_proc = subprocess.Popen(
            ["sudo", str(ts_binary), ip, password],
            stdout=log_file,
            stderr=subprocess.STDOUT,
            cwd=cs_dir,
            start_new_session=True,
        )

        time.sleep(2)
        if _teamserver_proc.poll() is not None:
            return {
                "success": False,
                "error": (
                    f"teamserver exited immediately (code {_teamserver_proc.returncode}). "
                    f"Check {log_path}"
                ),
            }

        return {"success": True, "pid": _teamserver_proc.pid, "log": log_path}

    except Exception as e:
        return {"success": False, "error": str(e)}


def _stop_teamserver() -> Dict[str, Any]:
    global _teamserver_proc
    pid = _get_teamserver_pid()
    if not pid:
        _teamserver_proc = None
        return {"success": True, "message": "Teamserver was not running"}
    try:
        subprocess.run(["sudo", "kill", "-SIGTERM", str(pid)], timeout=5, check=True)
        _teamserver_proc = None
        return {"success": True, "message": f"Teamserver (PID {pid}) stopped"}
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": f"kill failed: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _resolve_cs_library() -> Optional[Path]:
    """
    Find the cobaltstrikec2/ Robot Framework library directory.
    Resolution order:
      1. CS_LIBRARY_DIR env var
      2. CS_DIR/cobaltstrikec2/
      3. server/cobaltstrikec2/ (mock fallback — logs a warning)
    """
    candidates = [
        Path(CS_LIBRARY_DIR),
        Path(CS_DIR) / "cobaltstrikec2",
        Path(__file__).parent / "cobaltstrikec2",
    ]
    for c in candidates:
        if c.exists() and c.is_dir():
            return c
    return None


# =============================================================================
# Data directories
# =============================================================================

DATA_DIR = Path(__file__).parent / "data"

# -----------------------------------------------------------------------------
# Custom Commands — operator-authored modules
# -----------------------------------------------------------------------------
# Operators can author ad-hoc command modules during a session. They land here
# for the dev team to review and later promote into server/data/. The JSON
# schema matches what robotScriptGenerator.ts expects, minus the advanced
# robotFramework fields (which the dev team fills in during promotion).
CUSTOM_COMMANDS_DIR = Path(__file__).parent / "custom_commands"
CUSTOM_COMMANDS_DIR.mkdir(exist_ok=True)

CAMPAIGNS_DIR = Path(__file__).parent / "campaigns"
CAMPAIGNS_DIR.mkdir(exist_ok=True)


# =============================================================================
# App Lifecycle
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Operator API Server starting...")
    print(f"   C2 Library: {'Available' if C2_AVAILABLE else 'Not Found'}")
    print(f"   Script Builder: {'Available' if SCRIPT_BUILDER_AVAILABLE else 'Not Found'}")
    print(f"   Robot Framework: {check_robot_installed()}")
    print(f"   Robot command: {' '.join(_robot_cmd())}")
    print(f"   Ollama: {OLLAMA_HOST} ({OLLAMA_MODEL})")
    print(f"   Local module data: {DATA_DIR} ({'exists' if DATA_DIR.exists() else 'NOT FOUND'})")
    if DATA_DIR.exists():
        print(f"   Module JSON files: {len(list(DATA_DIR.glob('*.json')))}")
    print(f"   Custom commands: {CUSTOM_COMMANDS_DIR} ({len(list(CUSTOM_COMMANDS_DIR.glob('*.json')))} authored)")

    cs_lib = _resolve_cs_library()
    if cs_lib:
        is_mock = str(cs_lib).startswith(str(Path(__file__).parent))
        label = "⚠️  mock fallback" if is_mock else "✓ real library"
        print(f"   CS Library [{label}]: {cs_lib}")
    else:
        print(f"   CS Library: NOT FOUND — set CS_LIBRARY_DIR to your cobaltstrikec2/ path")

    ts_binary = Path(CS_DIR) / "teamserver"
    print(f"   Teamserver binary: {'found' if ts_binary.exists() else 'NOT FOUND'} ({ts_binary})")
    if _is_teamserver_running():
        print(f"   Teamserver: already running (PID {_get_teamserver_pid()})")
    else:
        print(f"   Teamserver: stopped — use Infrastructure tab to start deliberately")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_HOST}/api/tags")
            print(f"   Ollama: {'connected' if resp.status_code == 200 else f'returned {resp.status_code}'}")
    except Exception as e:
        print(f"   Ollama not reachable: {e}")

    yield

    print("👋 Operator API Server shutting down...")
    if C2_AVAILABLE:
        reset_c2()
    if _teamserver_proc and _teamserver_proc.poll() is None:
        print("   Teamserver left running (detached). Use Infrastructure tab to stop it.")


app = FastAPI(
    title="Operator API",
    description="Backend API for Lumen Campaign Studio",
    version="1.3.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    message: str
    history: Optional[List[ChatMessage]] = []
    system_prompt: Optional[str] = None

class ModuleGenerateRequest(BaseModel):
    capability: str
    tactic: str
    tactic_id: str
    execution_type: str

class CapabilityDescribeRequest(BaseModel):
    query: str

class TeamserverStartRequest(BaseModel):
    ip: str
    password: str
    cs_dir: Optional[str] = None


class CustomCommandRequest(BaseModel):
    """
    Operator-authored custom command module.

    Note on `_key`: Pydantic v2 treats leading-underscore attribute names as
    private by default. We bind the incoming JSON field `_key` to the
    attribute `key` via an alias, and enable `populate_by_name` so both work.
    Access via `request.key` inside handlers.
    """
    model_config = ConfigDict(populate_by_name=True)

    key: str = Field(..., alias="_key")
    name: str
    tactic: str
    icon: Optional[str] = "⚡"
    category: Optional[str] = "Custom"
    subcategory: Optional[str] = ""
    description: Optional[str] = ""
    riskLevel: Optional[str] = "medium"
    estimatedDuration: Optional[int] = 30
    executionType: Optional[str] = "cobalt_strike"
    parameters: List[Dict[str, Any]] = []
    robotFramework: Dict[str, Any] = {}


# =============================================================================
# LLM Helper
# =============================================================================

async def call_ollama(messages: List[dict], timeout: float = 90.0) -> str:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.post(
                f"{OLLAMA_HOST}/api/chat",
                json={"model": OLLAMA_MODEL, "messages": messages, "stream": False}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502,
                    detail=f"Ollama returned {resp.status_code}: {resp.text[:200]}")
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
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_HOST}/api/tags")
            if resp.status_code == 200:
                names = [m.get("name", "") for m in resp.json().get("models", [])]
                return {"available": True, "host": OLLAMA_HOST, "model": OLLAMA_MODEL,
                        "model_loaded": any(OLLAMA_MODEL in n for n in names), "models": names[:10]}
    except Exception:
        pass
    return {"available": False, "host": OLLAMA_HOST, "model": OLLAMA_MODEL}


@app.post("/api/chat")
async def chat_with_llm(request: ChatRequest):
    messages = [{"role": "system", "content": request.system_prompt or MODULE_ASSISTANT_SYSTEM_PROMPT}]
    for msg in (request.history or []):
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})
    reply = await call_ollama(messages)
    return {"reply": reply, "model": OLLAMA_MODEL}


@app.post("/api/chat/describe")
async def describe_capability(request: CapabilityDescribeRequest):
    messages = [
        {"role": "system", "content": MODULE_ASSISTANT_SYSTEM_PROMPT},
        {"role": "user", "content": (
            f'The operator needs: "{request.query}"\n\n'
            'In 1 sentence, describe this capability and the MITRE ATT&CK technique ID. No JSON.'
        )},
    ]
    return {"description": await call_ollama(messages, timeout=60.0), "model": OLLAMA_MODEL}


@app.post("/api/chat/generate-module")
async def generate_module(request: ModuleGenerateRequest):
    prompt = (
        f'Generate a module for: "{request.capability}"\n'
        f'Tactic: {request.tactic}, Execution: {request.execution_type}\n\n'
        'Reply in EXACTLY this format (no markdown, no extra text):\n'
        'NAME: <3-5 word module name>\nRISK: <low|medium|high|critical>\n'
        'COMMAND: <command template using ${PARAM_NAME} for variables>\n'
        'PARAMS: <comma-separated parameter names>\nDESCRIPTION: <1 sentence>'
    )
    messages = [
        {"role": "system", "content": MODULE_ASSISTANT_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    return {"raw": await call_ollama(messages, timeout=90.0), "model": OLLAMA_MODEL}


# =============================================================================
# Infrastructure helpers
# =============================================================================

def check_robot_installed() -> str:
    try:
        import robot.version
        return f"Installed (Robot Framework {robot.version.VERSION})"
    except ImportError:
        return "Not installed"


@app.get("/api/infrastructure/status")
async def get_infrastructure_status():
    robot_status = check_robot_installed()
    c2_status    = get_c2_status() if C2_AVAILABLE else {"connected": False}
    ts_running   = _is_teamserver_running()
    cs_lib       = _resolve_cs_library()
    ts_binary    = Path(CS_DIR) / "teamserver"

    llm_ok = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_HOST}/api/tags")
            llm_ok = resp.status_code == 200
    except Exception:
        pass

    return {
        "robot_framework": {
            "available": "Installed" in robot_status,
            "status": robot_status,
            "executable": " ".join(_robot_cmd()),
        },
        "cobalt_strike": {
            "available": C2_AVAILABLE,
            "connected": c2_status.get("connected", False),
            "teamserver": c2_status.get("teamserver"),
            "listeners": c2_status.get("listeners", 0),
            "payloads": c2_status.get("payloads", 0),
        },
        "teamserver": {
            "running": ts_running,
            "pid": _get_teamserver_pid() if ts_running else None,
            "host": CS_IP or None,
            "port": 50050,
            "binary_exists": ts_binary.exists(),
            "binary_path": str(ts_binary),
            "cs_dir": CS_DIR,
        },
        "cs_library": {
            "path": str(cs_lib) if cs_lib else None,
            "found": cs_lib is not None,
            "is_mock": cs_lib is not None and str(cs_lib).startswith(str(Path(__file__).parent)),
            "configured_path": CS_LIBRARY_DIR,
        },
        "llm": {"available": llm_ok, "host": OLLAMA_HOST, "model": OLLAMA_MODEL},
        "python": {"version": sys.version, "executable": " ".join(_robot_cmd())},
        "script_builder": {"available": SCRIPT_BUILDER_AVAILABLE},
    }


# =============================================================================
# C2 Management Endpoints
# =============================================================================

@app.post("/api/c2/connect")
async def connect_c2(request: C2ConnectRequest):
    if not C2_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2 library not available")
    try:
        result = start_c2(host=request.host, port=request.port, user=request.user,
                          password=request.password, cs_dir=request.cs_dir)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/c2/disconnect")
async def disconnect_c2():
    if not C2_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2 library not available")
    return {"success": True, "data": stop_c2()}


@app.get("/api/c2/status")
async def c2_status():
    if not C2_AVAILABLE:
        return {"available": False, "connected": False}
    return {"available": True, "connected": is_connected(),
            "info": get_teamserver_info() if is_connected() else None}


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
        result = create_listener(name=request.name, port=request.port,
                                  listener_type=request.listener_type, host=request.host,
                                  bind_to=request.bind_to, profile=request.profile)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/c2/payloads")
async def get_payloads():
    if not C2_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2 library not available")
    return {"payloads": list_payloads()}


@app.post("/api/c2/payloads")
async def generate_payload_endpoint(request: PayloadRequest):
    if not C2_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2 library not available")
    try:
        path = create_payload(name=request.name, template=request.template,
                               listener=request.listener, output_dir=request.output_dir,
                               retries=request.retries, arch=request.arch)
        return {"success": True, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Teamserver Management Endpoints
# =============================================================================

@app.get("/api/c2/teamserver/status")
async def teamserver_status():
    """Live process status of the CS teamserver + last 20 log lines."""
    running  = _is_teamserver_running()
    log_path = _teamserver_log_path or "/tmp/lumen_teamserver.log"
    log_tail: List[str] = []
    try:
        with open(log_path, "r") as f:
            log_tail = [l.rstrip() for l in f.readlines()[-20:]]
    except Exception:
        pass

    cs_lib    = _resolve_cs_library()
    ts_binary = Path(CS_DIR) / "teamserver"

    return {
        "running": running,
        "pid": _get_teamserver_pid() if running else None,
        "host": CS_IP or None,
        "port": 50050,
        "binary_exists": ts_binary.exists(),
        "binary_path": str(ts_binary),
        "cs_dir": CS_DIR,
        "cs_library": {
            "path": str(cs_lib) if cs_lib else None,
            "found": cs_lib is not None,
            "is_mock": cs_lib is not None and str(cs_lib).startswith(str(Path(__file__).parent)),
        },
        "log_path": log_path,
        "log_tail": log_tail,
    }


@app.post("/api/c2/teamserver/start")
async def start_teamserver_endpoint(request: TeamserverStartRequest):
    """Start the CS teamserver. No-op (returns success) if already running."""
    if _is_teamserver_running():
        return {"success": True, "message": "Teamserver already running",
                "pid": _get_teamserver_pid()}
    return _launch_teamserver(request.ip, request.password, request.cs_dir or CS_DIR)


@app.post("/api/c2/teamserver/stop")
async def stop_teamserver_endpoint():
    return _stop_teamserver()


@app.get("/api/c2/teamserver/logs")
async def teamserver_logs(lines: int = 100):
    log_path = _teamserver_log_path or "/tmp/lumen_teamserver.log"
    try:
        with open(log_path, "r") as f:
            all_lines = f.readlines()
        return {"lines": [l.rstrip() for l in all_lines[-lines:]],
                "path": log_path, "total": len(all_lines)}
    except FileNotFoundError:
        return {"lines": [], "path": log_path, "total": 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Robot Framework Execution
# =============================================================================

@app.post("/api/robot/execute")
async def execute_robot(request: RobotExecutionRequest, background_tasks: BackgroundTasks):
    execution_id = str(uuid.uuid4())
    import tempfile
    work_dir = Path(tempfile.gettempdir()) / "operator_robot" / execution_id
    work_dir.mkdir(parents=True, exist_ok=True)
    script_path = work_dir / (request.script_name or "workflow.robot")
    script_path.write_text(request.script_content)
    _executions[execution_id] = {
        "id": execution_id, "status": "pending", "script_path": str(script_path),
        "started_at": datetime.now().isoformat(), "completed_at": None,
        "output": [], "return_code": None, "error": None,
    }
    background_tasks.add_task(run_robot_script, execution_id, script_path, work_dir, request.variables)
    return {"execution_id": execution_id, "status": "started", "script_path": str(script_path)}


async def run_robot_script(execution_id: str, script_path: Path, work_dir: Path,
                            variables: Optional[Dict[str, str]] = None):
    _executions[execution_id]["status"] = "running"
    cmd = _robot_cmd() + ["--outputdir", str(work_dir / "output"), "--consolecolors", "off"]
    if variables:
        for k, v in variables.items():
            cmd.extend(["--variable", f"{k}:{v}"])
    cmd.append(str(script_path))
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, cwd=str(work_dir))
        output_lines: List[str] = []
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            output_lines.append(line.decode().rstrip())
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

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


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
            "teamserver": _is_teamserver_running(),
        },
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
    """
    Create a Robot execution session.
    Copies the real cobaltstrikec2/ library into the temp working directory
    so Robot finds it via the relative import in generated .robot files.

    Gap 2 fix: CS credentials are injected into the Library declaration
    before the script is written to disk.
    """
    session_id = str(uuid.uuid4())
    import tempfile
    work_dir = Path(tempfile.gettempdir()) / "operator_robot" / session_id
    work_dir.mkdir(parents=True, exist_ok=True)

    server_dir = Path(__file__).parent

    # Copy cobaltstrikec2/ — real library preferred over mock
    cs_lib_src = _resolve_cs_library()
    if cs_lib_src:
        shutil.copytree(cs_lib_src, work_dir / "cobaltstrikec2", dirs_exist_ok=True)
        if str(cs_lib_src).startswith(str(server_dir)):
            print(f"[terminal] WARNING: using mock library from {cs_lib_src}")
        else:
            print(f"[terminal] CS library: {cs_lib_src}")
    else:
        print("[terminal] WARNING: cobaltstrikec2 not found — Robot will fail on CS keywords")

    # Copy any .resource files from server/
    for resource_file in server_dir.glob("*.resource"):
        shutil.copy(resource_file, work_dir / resource_file.name)

    script_path = work_dir / (request.script_name or "workflow.robot")

    # ------------------------------------------------------------------
    # Gap 2 fix: inject CS constructor args into the Library declaration
    # so the cobaltstrike RF library receives the teamserver credentials.
    # ------------------------------------------------------------------
    script_content = request.script_content
    if SCRIPT_BUILDER_AVAILABLE and (CS_IP or CS_PASS):
        script_content = inject_cs_settings(
            robot_script=script_content,
            cs_ip=CS_IP or "",
            cs_user=CS_USER,
            cs_pass=CS_PASS or "",
            cs_dir=str(cs_lib_src.parent) if cs_lib_src else CS_DIR,
            cs_port=50050,
            debug=bool(os.getenv("DEBUG_MODE", "")),
        )
        print(f"[terminal] CS credentials injected into library declaration")
    elif not (CS_IP or CS_PASS):
        print(f"[terminal] WARNING: CS_IP and CS_PASS not set — library will use defaults")

    script_path.write_text(script_content)

    _terminal_sessions[session_id] = {
        "id": session_id, "script_path": str(script_path), "work_dir": str(work_dir),
        "status": "created", "created_at": datetime.now().isoformat(),
        "cs_library": str(cs_lib_src) if cs_lib_src else None,
        "cs_credentials_injected": SCRIPT_BUILDER_AVAILABLE and bool(CS_IP or CS_PASS),
    }
    return {"session_id": session_id, "script_path": str(script_path), "work_dir": str(work_dir)}


@app.websocket("/api/terminal/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session = _terminal_sessions.get(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return
    cmd = _robot_cmd() + ["--consolecolors", "on", session["script_path"]]
    try:
        if PTY_AVAILABLE and sys.platform != "win32":
            await run_with_pty(websocket, cmd, session["work_dir"])
        else:
            await run_with_subprocess(websocket, cmd, session["work_dir"])
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        _terminal_sessions[session_id]["status"] = "completed"


async def run_with_pty(websocket: WebSocket, cmd: List[str], work_dir: str):
    import pty, fcntl, termios, struct, select
    master_fd, slave_fd = pty.openpty()
    winsize = struct.pack('HHHH', 24, 80, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
    process = subprocess.Popen(cmd, stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
                                cwd=work_dir, close_fds=True)
    os.close(slave_fd)
    fcntl.fcntl(master_fd, fcntl.F_SETFL,
                fcntl.fcntl(master_fd, fcntl.F_GETFL) | os.O_NONBLOCK)
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
    except Exception:
        return
    env = os.environ.copy()
    env.update({"PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"})
    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    cwd=work_dir, env=env, bufsize=1, universal_newlines=True,
                                    encoding="utf-8", errors="replace")
        await websocket.send_json({"type": "started", "pid": process.pid})
        loop = asyncio.get_event_loop()
        for line in await loop.run_in_executor(None, lambda: list(process.stdout)):
            await websocket.send_text(line)
        stderr_text = await loop.run_in_executor(None, process.stderr.read)
        if stderr_text:
            await websocket.send_text(f"\n[STDERR]:\n{stderr_text}\n")
        process.wait()
    except Exception as e:
        import traceback
        await websocket.send_json({"type": "error",
            "message": f"Process error: {str(e)}\n{traceback.format_exc()}"})
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
    work_dir = Path(tempfile.gettempdir()) / "operator_test" / uuid.uuid4().hex[:8]
    work_dir.mkdir(parents=True, exist_ok=True)
    test_script = (
        "*** Settings ***\nLibrary    Collections\n\n"
        "*** Test Cases ***\nHello World Test\n"
        "    Log    Hello from Lumen Campaign Studio!\n"
        "    ${result}=    Evaluate    1 + 1\n"
        "    Should Be Equal As Numbers    ${result}    2\n"
    )
    script_path = work_dir / "test.robot"
    script_path.write_text(test_script)
    cmd = _robot_cmd() + ["--outputdir", str(work_dir / "output"), "--consolecolors", "off", str(script_path)]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=str(work_dir))
        return {"success": result.returncode == 0, "return_code": result.returncode,
                "stdout": result.stdout, "stderr": result.stderr}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# Local Module Data Endpoints
# =============================================================================

@app.get("/api/library-modules")
async def get_library_modules(search: Optional[str] = None, limit: int = 500):
    modules = []
    if not DATA_DIR.exists():
        return {"modules": [], "total": 0}
    for json_file in sorted(DATA_DIR.glob("*.json")):
        try:
            data = json.loads(json_file.read_text())
            module = {
                "_key": data.get("_key", json_file.stem),
                "id": data.get("_key", json_file.stem),
                "name": data.get("name", json_file.stem),
                "icon": data.get("icon", "⚡"),
                "tactic": data.get("tactic", "control"),
                "category": data.get("category", "Cobalt Strike"),
                "subcategory": data.get("subcategory", ""),
                "description": data.get("description", ""),
                "riskLevel": data.get("riskLevel", "medium"),
                "estimatedDuration": data.get("estimatedDuration", 30),
                "executionType": data.get("executionType", "cobalt_strike"),
                "tags": data.get("tags", []),
                "payload_url": f"/api/ingest/payloads/{json_file.stem}.json",
            }
            if search:
                sl = search.lower()
                if not any(sl in str(v).lower() for v in [
                        module["name"], module["description"],
                        module["tactic"], module["category"]]):
                    continue
            modules.append(module)
        except Exception as e:
            print(f"Warning: Could not load {json_file.name}: {e}")
    return {"modules": modules[:limit], "total": len(modules)}


@app.get("/api/ingest/payloads/{module_key}.json")
async def get_module_payload(module_key: str):
    payload_path = DATA_DIR / f"{module_key}.json"
    if not payload_path.exists():
        raise HTTPException(status_code=404, detail=f"Payload not found: {module_key}")
    try:
        return json.loads(payload_path.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read payload: {e}")


# =============================================================================
# Custom Commands Endpoints — operator-authored modules
# =============================================================================
# Saved JSONs conform to the same schema robotScriptGenerator.ts consumes.
# Dev team reviews server/custom_commands/*.json and promotes good ones
# into server/data/ by hand. No auto-publish.

def _custom_cmd_path(key: str) -> Path:
    """Sanitize key and return path under CUSTOM_COMMANDS_DIR."""
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in key).strip("_")
    if not safe:
        raise HTTPException(status_code=400, detail="Invalid custom command key")
    return CUSTOM_COMMANDS_DIR / f"{safe}.json"


@app.get("/api/custom-commands")
async def list_custom_commands():
    """Return all custom commands in the same shape as /api/library-modules."""
    modules = []
    for json_file in sorted(CUSTOM_COMMANDS_DIR.glob("*.json")):
        try:
            data = json.loads(json_file.read_text())
            modules.append({
                "_key": data.get("_key", data.get("key", json_file.stem)),
                "id": data.get("_key", data.get("key", json_file.stem)),
                "name": data.get("name", json_file.stem),
                "icon": data.get("icon", "⚡"),
                "tactic": data.get("tactic", "control"),
                "category": data.get("category", "Custom"),
                "subcategory": data.get("subcategory", ""),
                "description": data.get("description", ""),
                "riskLevel": data.get("riskLevel", "medium"),
                "estimatedDuration": data.get("estimatedDuration", 30),
                "executionType": data.get("executionType", "cobalt_strike"),
                "tags": data.get("tags", []),
                "isCustom": True,  # palette uses this to badge the card
                "payload_url": f"/api/custom-commands/{json_file.stem}",
            })
        except Exception as e:
            print(f"Warning: Could not load custom command {json_file.name}: {e}")
    return {"modules": modules, "total": len(modules)}


@app.get("/api/custom-commands/{key}")
async def get_custom_command(key: str):
    """Return full payload for a single custom command."""
    path = _custom_cmd_path(key)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Custom command not found: {key}")
    try:
        return json.loads(path.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read custom command: {e}")


@app.post("/api/custom-commands")
async def save_custom_command(request: CustomCommandRequest):
    """Write a new custom command JSON. Returns the full saved payload."""
    # Minimal validation: require name and keyword
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    if not request.robotFramework.get("keyword"):
        raise HTTPException(status_code=400, detail="robotFramework.keyword is required")

    # Serialize by alias so the JSON on disk has `_key` (matches robotScriptGenerator.ts)
    payload = request.model_dump(by_alias=True)
    payload["_authored_by"] = "operator"
    payload["_authored_at"] = datetime.now().isoformat()
    payload["isCustom"] = True

    path = _custom_cmd_path(request.key)
    try:
        path.write_text(json.dumps(payload, indent=2))
        return {"status": "saved", "key": request.key, "path": str(path), "payload": payload}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save custom command: {e}")


@app.delete("/api/custom-commands/{key}")
async def delete_custom_command(key: str):
    path = _custom_cmd_path(key)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Custom command not found: {key}")
    path.unlink()
    return {"status": "deleted", "key": key}


# =============================================================================
# Campaign Persistence Endpoints
# =============================================================================

class CampaignSaveRequest(BaseModel):
    name: str
    workflow: Dict[str, Any]


def _campaign_path(name: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip()
    return CAMPAIGNS_DIR / f"{safe}.lumen"


@app.get("/api/campaigns")
async def list_campaigns():
    campaigns = []
    for f in sorted(CAMPAIGNS_DIR.glob("*.lumen"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text())
            meta = data.get("metadata", {})
            campaigns.append({
                "name": meta.get("name", f.stem), "description": meta.get("description", ""),
                "author": meta.get("author", ""), "created": meta.get("created", ""),
                "lastModified": meta.get("lastModified", ""), "tags": meta.get("tags", []),
                "nodeCount": len(data.get("nodes", [])), "edgeCount": len(data.get("edges", [])),
            })
        except Exception as e:
            print(f"Warning: Could not read {f.name}: {e}")
    return {"campaigns": campaigns, "total": len(campaigns)}


@app.post("/api/campaigns")
async def save_campaign(request: CampaignSaveRequest):
    path = _campaign_path(request.name)
    try:
        path.write_text(json.dumps(request.workflow, indent=2))
        return {"status": "saved", "name": request.name, "path": str(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save campaign: {e}")


@app.get("/api/campaigns/{name}")
async def load_campaign(name: str):
    path = _campaign_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Campaign not found: {name}")
    try:
        return json.loads(path.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load campaign: {e}")


@app.delete("/api/campaigns/{name}")
async def delete_campaign(name: str):
    path = _campaign_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Campaign not found: {name}")
    path.unlink()
    return {"status": "deleted", "name": name}


# =============================================================================
# Static / Main
# =============================================================================

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)