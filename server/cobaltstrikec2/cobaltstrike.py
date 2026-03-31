# server/cobaltstrikec2/cobaltstrike.py
# Mock Cobalt Strike library for development/simulation
# Mimics the real aggressor script API responses
#
# PATCH NOTES:
#   - Session now inherits collections.abc.Mapping so Robot Framework
#     treats it as a dict-like object for variable access (${session}[key])
#   - Added __len__ and __iter__ required by Mapping ABC
#   - Session constructor guards against double-wrapping (Session(Session(...)))
#   - stop_c2 is safe to call even when not connected (teardown safe)
#   - run_mimikatz output sanitised (no raw backslashes that break RF logger)

import time
import uuid
import os
from datetime import datetime
from typing import Optional, Dict, Any, List
from collections.abc import Mapping
import random

# Simulated state
_connected = False
_teamserver_info = {}
_listeners: Dict[str, Dict] = {}
_payloads: Dict[str, Dict] = {}
_beacons: Dict[str, Dict] = {}
_sessions: Dict[str, Dict] = {}
_command_queue: List[Dict] = []
_credentials: List[Dict] = []


def _log(message: str):
    """Internal logging with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[CS-MOCK {timestamp}] {message}")


def _generate_beacon_id() -> str:
    """Generate a realistic-looking beacon ID"""
    return f"{random.randint(100000, 999999)}"


# =============================================================================
# Connection Management
# =============================================================================

def start_c2(host: str = None, port: int = None, user: str = None, password: str = None, cs_dir: str = "/opt/cobaltstrike") -> Dict[str, Any]:
    """
    Start/connect to the Cobalt Strike teamserver

    Robot Keyword: Start C2
    """
    global _connected, _teamserver_info

    if host is None:
        try:
            from robot.libraries.BuiltIn import BuiltIn
            bi = BuiltIn()
            host = bi.get_variable_value("${CS_IP}", "127.0.0.1")
            port = int(bi.get_variable_value("${CS_PORT}", "50050"))
            user = bi.get_variable_value("${CS_USER}", "operator")
            password = bi.get_variable_value("${CS_PASS}", "password")
            cs_dir = bi.get_variable_value("${CS_DIR}", "/opt/cobaltstrike")
        except Exception as e:
            _log(f"Could not get Robot variables: {e}")
            host = "127.0.0.1"
            port = 50050
            user = "operator"
            password = "password"

    _log(f"Connecting to teamserver at {host}:{port} as {user}...")
    time.sleep(0.5)

    _connected = True
    _teamserver_info = {
        "host": host,
        "port": port,
        "user": user,
        "cs_dir": cs_dir,
        "connected_at": datetime.now().isoformat(),
        "version": "4.9.1 (Mock)",
        "license": "DEVELOPMENT"
    }

    _log(f"Connected to teamserver {host}:{port}")
    _log(f"  Version: {_teamserver_info['version']}")

    return {
        "status": "connected",
        "teamserver": host,
        "port": port,
        "user": user,
        "version": _teamserver_info["version"]
    }


def stop_c2() -> Dict[str, Any]:
    """
    Disconnect from the Cobalt Strike teamserver

    Robot Keyword: Stop C2
    """
    global _connected, _teamserver_info, _listeners, _payloads, _beacons, _sessions, _credentials

    if not _connected:
        _log("Not connected to any teamserver — nothing to stop")
        return {"status": "not_connected"}

    _log("Disconnecting from teamserver...")
    time.sleep(0.3)

    host = _teamserver_info.get("host", "unknown")

    _log(f"  Sessions active: {len(_sessions)}")
    _log(f"  Credentials collected: {len(_credentials)}")
    _log(f"  Listeners: {len(_listeners)}")

    _connected = False
    _teamserver_info = {}
    _listeners = {}
    _payloads = {}
    _beacons = {}
    _sessions = {}
    _credentials = []

    _log(f"Disconnected from {host}")

    return {"status": "disconnected", "teamserver": host}


def is_connected() -> bool:
    """Check if connected to teamserver"""
    return _connected


def get_teamserver_info() -> Dict[str, Any]:
    """Get current teamserver connection info"""
    if not _connected:
        return {"status": "not_connected"}
    return _teamserver_info.copy()


# =============================================================================
# Listener Management
# =============================================================================

def create_listener(
    name: str,
    port: int,
    listener_type: str,
    host: str,
    bind_to: Optional[str] = None,
    profile: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a new listener on the teamserver

    Robot Keyword: Create Listener
    """
    global _listeners

    if not _connected:
        raise RuntimeError("Not connected to teamserver. Call start_c2() first.")

    _log(f"Creating {listener_type} listener '{name}' on {host}:{port}...")
    time.sleep(0.3)

    listener_id = f"listener_{uuid.uuid4().hex[:8]}"

    listener_data = {
        "id": listener_id,
        "name": name,
        "port": port,
        "type": listener_type,
        "host": host,
        "bind_to": bind_to or "0.0.0.0",
        "profile": profile or "default",
        "status": "active",
        "created_at": datetime.now().isoformat(),
        "beacon_count": 0
    }

    _listeners[name] = listener_data

    _log(f"Listener '{name}' created successfully")
    _log(f"  Type: {listener_type}")
    _log(f"  Endpoint: {host}:{port}")

    return listener_data


def list_listeners() -> List[Dict[str, Any]]:
    """Get all active listeners"""
    return list(_listeners.values())


def remove_listener(name: str) -> Dict[str, Any]:
    """Remove a listener by name"""
    if name not in _listeners:
        _log(f"Listener '{name}' not found")
        return {"status": "not_found", "name": name}

    listener = _listeners.pop(name)
    _log(f"Listener '{name}' removed")

    return {"status": "removed", "listener": listener}


# =============================================================================
# Payload Generation
# =============================================================================

def create_payload(
    name: str,
    template: str,
    listener: str,
    output_dir: str,
    retries: int = 3,
    arch: str = "x64",
    format_type: Optional[str] = None
) -> str:
    """
    Generate a payload for a specific listener

    Robot Keyword: Create Payload

    Returns:
        Path to the generated payload
    """
    global _payloads

    if not _connected:
        raise RuntimeError("Not connected to teamserver. Call start_c2() first.")

    ext_map = {
        "exe": ".exe",
        "dll": ".dll",
        "ps1": ".ps1",
        "raw": ".bin",
        "svc_exe": ".exe",
        "hta": ".hta",
        "vba": ".vba"
    }
    extension = ext_map.get(template.lower(), ".bin")

    filename = f"{name}{extension}"
    output_path = os.path.join(output_dir, filename)

    _log(f"Generating {template} payload '{name}'...")
    _log(f"  Listener: {listener}")
    _log(f"  Architecture: {arch}")
    _log(f"  Output: {output_path}")

    time.sleep(0.3)

    payload_id = f"payload_{uuid.uuid4().hex[:8]}"

    payload_data = {
        "id": payload_id,
        "name": name,
        "filename": filename,
        "template": template,
        "listener": listener,
        "arch": arch,
        "path": output_path,
        "size": 290816 + hash(name) % 50000,
        "created_at": datetime.now().isoformat(),
        "hash": uuid.uuid4().hex
    }

    _payloads[name] = payload_data

    _log(f"Payload generated successfully")
    _log(f"  Path: {output_path}")

    return output_path


def list_payloads() -> List[Dict[str, Any]]:
    """Get all generated payloads"""
    return list(_payloads.values())


# =============================================================================
# Session Object
# =============================================================================

class Session(Mapping):
    """
    Represents a beacon session.

    Inherits from collections.abc.Mapping so Robot Framework treats it as
    a dict-like object — ${session}[beacon_id] works reliably in RF 4+.

    Also supports attribute access (session.beacon_id) for Python-side code.
    """

    def __init__(self, data):
        # Guard: if someone passes a Session, just copy its data dict
        if isinstance(data, Session):
            self._data = dict(data._data)
        else:
            self._data = dict(data)

        for key, value in self._data.items():
            # Don't overwrite dunder/private attrs
            if not key.startswith('_'):
                object.__setattr__(self, key, value)

    # ── Mapping ABC requirements ──────────────────────────────────────────

    def __getitem__(self, key):
        return self._data[key]

    def __iter__(self):
        return iter(self._data)

    def __len__(self):
        return len(self._data)

    # ── Convenience ───────────────────────────────────────────────────────

    def __repr__(self):
        return f"Session(beacon_id={self._data.get('beacon_id')}, ip={self._data.get('ip')}, user={self._data.get('username')})"

    def __str__(self):
        return f"<Session {self._data.get('beacon_id')} @ {self._data.get('ip')} ({self._data.get('username')})>"

    def to_dict(self) -> Dict[str, Any]:
        return dict(self._data)


def _to_session(session) -> "Session":
    """
    Safely coerce any input to a Session object.
    Handles: Session instance, plain dict, or anything with a .to_dict().
    """
    if isinstance(session, Session):
        return session
    if isinstance(session, dict):
        return Session(session)
    if hasattr(session, 'to_dict'):
        return Session(session.to_dict())
    # Last resort: try treating it as a mapping
    return Session(dict(session))


def _create_mock_session(ip: str, username: str = "SYSTEM", computer: str = None,
                         domain: str = "WORKGROUP", listener: str = "HTTP") -> Session:
    """Create a mock session object"""
    beacon_id = _generate_beacon_id()

    if computer is None:
        computer = f"DESKTOP-{uuid.uuid4().hex[:6].upper()}"

    session_data = {
        "beacon_id": beacon_id,
        "ip": ip,
        "internal_ip": ip,
        "external_ip": ip,
        "username": username,
        "computer": computer,
        "domain": domain,
        "os": "Windows 10 (10.0 Build 19045)",
        "arch": "x64",
        "process": "explorer.exe",
        "pid": random.randint(1000, 9999),
        "listener": listener,
        "last_seen": datetime.now().isoformat(),
        "first_seen": datetime.now().isoformat(),
        "sleep": 60,
        "jitter": 0,
        "is_admin": username in ["SYSTEM", "Administrator"],
        "elevated": username == "SYSTEM",
    }

    session = Session(session_data)
    _sessions[beacon_id] = session
    _beacons[beacon_id] = session_data

    return session


# =============================================================================
# Session Management
# =============================================================================

def get_sessions_by_ip(ip: str) -> List[Session]:
    """
    Get all sessions from a specific IP address

    Robot Keyword: Get Sessions By Ip

    Args:
        ip: Target IP address

    Returns:
        List of Session objects matching the IP
    """
    _log(f"Getting sessions for IP: {ip}")

    matching_sessions = [s for s in _sessions.values() if s['ip'] == ip]

    if not matching_sessions:
        _log(f"  No existing sessions — simulating new beacon callback...")
        session = _create_mock_session(ip)
        matching_sessions = [session]
        _log(f"  New session: {session['beacon_id']} ({session['username']}@{session['computer']})")
    else:
        _log(f"  Found {len(matching_sessions)} session(s)")
        for s in matching_sessions:
            _log(f"    - {s['beacon_id']}: {s['username']}@{s['computer']}")

    return matching_sessions


def get_sessions_by_user(username: str) -> List[Session]:
    """
    Get all sessions for a specific username

    Robot Keyword: Get Sessions By User
    """
    _log(f"Getting sessions for user: {username}")

    matching_sessions = [s for s in _sessions.values() if s['username'] == username]

    _log(f"  Found {len(matching_sessions)} session(s)")
    for s in matching_sessions:
        _log(f"    - {s['beacon_id']}: {s['ip']} ({s['computer']})")

    return matching_sessions


def list_sessions() -> List[Session]:
    """Get all active sessions"""
    return list(_sessions.values())


# =============================================================================
# Beacon Commands
# =============================================================================

def run_getuid(session) -> str:
    """
    Get the current user identity from a beacon

    Robot Keyword: GetUID (via wrapper)
    """
    session = _to_session(session)

    _log(f"Running getuid on beacon {session['beacon_id']}...")
    time.sleep(0.2)

    if session['domain'] and session['domain'] != "WORKGROUP":
        user_id = f"{session['domain']}\\{session['username']}"
    else:
        user_id = f"{session['computer']}\\{session['username']}"

    if session['elevated'] or session['username'] == "SYSTEM":
        user_id += " *"

    _log(f"  User: {user_id}")

    return user_id


def issue_shell_cmd(session, command: str) -> Dict[str, Any]:
    """
    Issue a shell command via beacon

    Robot Keyword: Issue Shell Cmd
    """
    session = _to_session(session)

    _log(f"Executing shell command on beacon {session['beacon_id']}...")
    _log(f"  Command: {command[:80]}{'...' if len(command) > 80 else ''}")
    time.sleep(0.3)

    output = ""
    if command.startswith("whoami"):
        output = f"{session['domain']}\\{session['username']}"
    elif command.startswith("hostname"):
        output = session['computer']
    elif command.startswith("ipconfig"):
        output = f"IPv4 Address: {session['ip']}\nSubnet Mask:  255.255.255.0"
    elif command.startswith("dir"):
        output = (
            f" Volume in drive C has no label.\n"
            f" Directory of C:\\Users\\{session['username']}\n\n"
            f"01/27/2026  10:30 AM    <DIR>  Desktop\n"
            f"01/27/2026  10:30 AM    <DIR>  Documents\n"
            f"01/27/2026  10:30 AM    <DIR>  Downloads\n"
        )
    elif command.startswith("tasklist"):
        output = (
            f"Image Name                PID  Mem Usage\n"
            f"========================= ==== ============\n"
            f"System Idle Process          0        8 K\n"
            f"explorer.exe          {session['pid']}   {random.randint(50000,150000)} K\n"
        )
    elif command.startswith("reg "):
        output = (
            f"HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\n"
            f"    WindowsUpdate    REG_SZ    C:\\Windows\\System32\\svchost_upd.exe\n"
        )
    elif command.startswith("arp"):
        output = (
            f"Interface: {session['ip']} --- 0x5\n"
            f"  Internet Address      Physical Address      Type\n"
            f"  192.168.1.1           00-11-22-33-44-55     dynamic\n"
            f"  192.168.1.254         66-77-88-99-aa-bb     dynamic\n"
        )
    elif "net stop" in command or "net start" in command:
        service = command.split()[-1]
        action = "stopped" if "stop" in command else "started"
        output = f"The {service} service was {action} successfully."
    elif "schtasks" in command:
        if "/create" in command:
            output = 'SUCCESS: The scheduled task "Updates" has been created.'
        elif "/query" in command:
            output = "TaskName     Next Run Time   Status\nUpdates      At system startup  Ready"
    elif "del " in command or "move " in command or "copy " in command:
        output = "        1 file(s) processed."
    elif command.strip() == "echo" or command.startswith("echo "):
        output = command.replace("echo ", "").replace("%CD%", f"C:\\Users\\{session['username']}")
    else:
        output = f"The command completed successfully."

    _log(f"  Command completed")

    return {
        "success": True,
        "output": output,
        "command": command,
        "beacon_id": session['beacon_id']
    }


def issue_powershell_cmd(session, command: str) -> Dict[str, Any]:
    """
    Issue a PowerShell command via beacon

    Robot Keyword: Issue Powershell Cmd
    """
    session = _to_session(session)

    _log(f"Executing PowerShell on beacon {session['beacon_id']}...")
    _log(f"  Command: {command[:80]}{'...' if len(command) > 80 else ''}")
    time.sleep(0.3)

    output = ""
    if "Compress-Archive" in command:
        output = "Archive created successfully."
    elif "Get-Process" in command:
        output = (
            f"Handles  NPM(K)  PM(K)   WS(K)  CPU(s)  Id  ProcessName\n"
            f"-------  ------  -----   -----  ------  --  -----------\n"
            f"    523      25  78432   89244    2.34  {session['pid']}  explorer\n"
        )
    else:
        output = f"PowerShell command completed successfully."

    _log(f"  PowerShell completed")

    return {
        "success": True,
        "output": output,
        "command": command,
        "beacon_id": session['beacon_id']
    }


def run_mimikatz(session) -> Dict[str, Any]:
    """
    Run mimikatz to dump credentials

    Robot Keyword: run_mimikatz
    """
    global _credentials

    session = _to_session(session)

    _log(f"Running mimikatz on beacon {session['beacon_id']}...")
    _log(f"  Target: {session['ip']} ({session['computer']})")
    time.sleep(0.5)

    creds = [
        {
            "domain": session['domain'],
            "username": "Administrator",
            "ntlm": "aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0",
            "password": "(not found)",
            "source_ip": session['ip']
        },
        {
            "domain": session['domain'],
            "username": "svc_backup",
            "ntlm": f"aad3b435b51404eeaad3b435b51404ee:{uuid.uuid4().hex}",
            "password": "Backup2026!",
            "source_ip": session['ip']
        },
        {
            "domain": session['domain'],
            "username": session['username'],
            "ntlm": f"aad3b435b51404eeaad3b435b51404ee:{uuid.uuid4().hex}",
            "password": "P@ssw0rd123",
            "source_ip": session['ip']
        }
    ]

    _credentials.extend(creds)

    # Build output — avoid raw backslashes that confuse RF's logger
    rand_logon = random.randint(0x10000, 0xfffff)
    rand_sha1  = uuid.uuid4().hex[:40]

    output = (
        "\n"
        "  .#####.   mimikatz 2.2.0 (x64) #19041\n"
        ' .## ^ ##.  "A La Vie, A L\'Amour"\n'
        " ## / \\ ##  Benjamin DELPY\n"
        " ## \\ / ##\n"
        " '## v ##'\n"
        "  '#####'\n"
        "\n"
        f"Authentication Id : 0 ; {rand_logon:08x}\n"
        f"User Name         : {session['username']}\n"
        f"Domain            : {session['domain']}\n"
        f"Logon Server      : {session['computer']}\n"
        "\n"
        "    msv :\n"
        "     [00000003] Primary\n"
        f"     * Username : {session['username']}\n"
        f"     * Domain   : {session['domain']}\n"
        f"     * NTLM     : {creds[2]['ntlm']}\n"
        f"     * SHA1     : {rand_sha1}\n"
        "\n"
        f"     * Username : svc_backup\n"
        f"     * NTLM     : {creds[1]['ntlm']}\n"
        "     * Password : Backup2026!\n"
    )

    _log(f"  Mimikatz completed")
    _log(f"  Credentials found: {len(creds)}")
    for c in creds:
        _log(f"    - {c['domain']}\\{c['username']}")

    return {
        "success": True,
        "output": output,
        "credentials": creds,
        "beacon_id": session['beacon_id'],
        "result": session
    }


def run_bjump(session, method: str, target_ip: str, listener: str) -> Dict[str, Any]:
    """
    Lateral movement using various techniques

    Robot Keyword: Run Bjump
    """
    session = _to_session(session)

    _log(f"Performing lateral movement via {method}...")
    _log(f"  Source: {session['ip']} ({session['beacon_id']})")
    _log(f"  Target: {target_ip}")
    _log(f"  Listener: {listener}")

    time.sleep(0.5)

    new_session = _create_mock_session(
        ip=target_ip,
        username="SYSTEM",
        listener=listener
    )

    _log(f"  Lateral movement successful")
    _log(f"  New beacon: {new_session['beacon_id']} @ {target_ip}")

    return {
        "success": True,
        "method": method,
        "source_beacon": session['beacon_id'],
        "target_ip": target_ip,
        "result": new_session
    }


def Lateral_Move_Psexec(session, target_ip: str, listener: str) -> Dict[str, Any]:
    """
    Lateral movement using PsExec64

    Robot Keyword: Lateral_Move_Psexec
    """
    session = _to_session(session)

    _log(f"=== Lateral Movement via PsExec64 ===")
    _log(f"  Source: {session['ip']} ({session['username']})")
    _log(f"  Target: {target_ip}")
    _log(f"  Listener: {listener}")

    time.sleep(0.8)

    new_session = _create_mock_session(
        ip=target_ip,
        username="SYSTEM",
        computer=f"TARGET-{uuid.uuid4().hex[:4].upper()}",
        domain=session['domain'],
        listener=listener
    )

    _log(f"  PsExec lateral movement successful")
    _log(f"  New beacon: {new_session['beacon_id']}")
    _log(f"  User: {new_session['username']}@{new_session['computer']}")

    return {
        "success": True,
        "method": "psexec64",
        "source_beacon": session['beacon_id'],
        "source_ip": session['ip'],
        "target_ip": target_ip,
        "new_beacon_id": new_session['beacon_id'],
        "result": new_session
    }


def run_bspawnas(session, domain: str, username: str, password: str, listener: str) -> Dict[str, Any]:
    """
    Spawn a new beacon as a different user

    Robot Keyword: Elevate With Spawnas
    """
    session = _to_session(session)

    _log(f"Spawning beacon as {domain}\\{username}...")
    _log(f"  Source beacon: {session['beacon_id']}")
    _log(f"  Listener: {listener}")

    time.sleep(0.4)

    new_session = _create_mock_session(
        ip=session['ip'],
        username=username,
        domain=domain,
        computer=session['computer'],
        listener=listener
    )

    _log(f"  Spawned new beacon as {domain}\\{username}")
    _log(f"  New beacon: {new_session['beacon_id']}")

    return {
        "success": True,
        "source_beacon": session['beacon_id'],
        "new_beacon": new_session['beacon_id'],
        "username": username,
        "domain": domain,
        "result": new_session
    }


def run_binject(session, pid: int, listener: str, arch: str = "x64") -> Dict[str, Any]:
    """
    Inject beacon into a process

    Robot Keyword: Inject Process
    """
    session = _to_session(session)

    _log(f"Injecting into process {pid}...")
    _log(f"  Source beacon: {session['beacon_id']}")
    _log(f"  Architecture: {arch}")

    time.sleep(0.3)

    new_session = _create_mock_session(
        ip=session['ip'],
        username=session['username'],
        domain=session['domain'],
        computer=session['computer'],
        listener=listener
    )

    _log(f"  Injection successful")
    _log(f"  New beacon: {new_session['beacon_id']} (PID: {pid})")

    return {
        "success": True,
        "source_beacon": session['beacon_id'],
        "target_pid": pid,
        "new_beacon": new_session['beacon_id'],
        "result": new_session
    }


def run_bportscan(session, targets: str, ports: str, method: str = "icmp") -> Dict[str, Any]:
    """
    Run a port scan from a beacon

    Robot Keyword: Network Enumerate
    """
    session = _to_session(session)

    _log(f"Running port scan from beacon {session['beacon_id']}...")
    _log(f"  Targets: {targets}")
    _log(f"  Ports: {ports}")
    _log(f"  Method: {method}")

    time.sleep(0.5)

    port_list = [int(p.strip()) for p in ports.split(",") if p.strip().isdigit()]
    results = []

    base_ip = targets.split("/")[0].rsplit(".", 1)[0]

    for _ in range(3):
        host_ip = f"{base_ip}.{random.randint(1, 254)}"
        for port in port_list[:2]:
            if random.random() > 0.5:
                results.append({"ip": host_ip, "port": port, "state": "open"})

    _log(f"  Scan completed — {len(results)} open port(s) found")

    return {
        "success": True,
        "beacon_id": session['beacon_id'],
        "targets": targets,
        "ports": ports,
        "results": results
    }


def upload_file(session, local_file: str, remote_path: str) -> Dict[str, Any]:
    """
    Upload a file to the target via beacon

    Robot Keyword: Upload File
    """
    session = _to_session(session)

    _log(f"Uploading file to beacon {session['beacon_id']}...")
    _log(f"  Local: {local_file}")
    _log(f"  Remote: {remote_path}")

    time.sleep(0.3)

    _log(f"  File uploaded successfully")

    return {
        "success": True,
        "beacon_id": session['beacon_id'],
        "local_file": local_file,
        "remote_path": remote_path,
        "size": random.randint(50000, 500000)
    }


def download_file(session, remote_file: str) -> Dict[str, Any]:
    """
    Download a file from the target via beacon

    Robot Keyword: Download File
    """
    session = _to_session(session)

    _log(f"Downloading file from beacon {session['beacon_id']}...")
    _log(f"  Remote: {remote_file}")

    time.sleep(0.3)

    local_path = f"/tmp/downloads/{os.path.basename(remote_file)}"

    _log(f"  File downloaded to {local_path}")

    return {
        "success": True,
        "beacon_id": session['beacon_id'],
        "remote_file": remote_file,
        "local_path": local_path,
        "size": random.randint(1000, 100000)
    }


def session_sleep(session, sleep_time: int, jitter: int = 0) -> Dict[str, Any]:
    """
    Set beacon sleep time

    Robot Keyword: Session Sleep
    """
    session = _to_session(session)

    _log(f"Setting sleep on beacon {session['beacon_id']}...")
    _log(f"  Sleep: {sleep_time}s, Jitter: {jitter}%")

    _log(f"  Sleep configured")

    return {
        "success": True,
        "beacon_id": session['beacon_id'],
        "sleep": sleep_time,
        "jitter": jitter
    }


def kill_session(session) -> Dict[str, Any]:
    """
    Kill a beacon session

    Robot Keyword: Kill Session
    """
    session = _to_session(session)
    beacon_id = session['beacon_id']

    _log(f"Killing beacon {beacon_id}...")

    _sessions.pop(beacon_id, None)
    _beacons.pop(beacon_id, None)

    _log(f"  Beacon {beacon_id} killed")

    return {"success": True, "beacon_id": beacon_id}


def run_btimestomp(session, target_file: str, reference_file: str) -> Dict[str, Any]:
    """
    Timestomp a file (copy timestamps from reference file)

    Robot Keyword: Run Btimestomp
    """
    session = _to_session(session)

    _log(f"Timestomping file on beacon {session['beacon_id']}...")
    _log(f"  Target: {target_file}")
    _log(f"  Reference: {reference_file}")

    time.sleep(0.2)

    _log(f"  Timestamps copied successfully")

    return {
        "success": True,
        "beacon_id": session['beacon_id'],
        "target_file": target_file,
        "reference_file": reference_file
    }


# =============================================================================
# Utility Functions
# =============================================================================

def get_status() -> Dict[str, Any]:
    """Get overall status of the mock C2"""
    return {
        "connected": _connected,
        "teamserver": _teamserver_info.get("host") if _connected else None,
        "listeners": len(_listeners),
        "payloads": len(_payloads),
        "beacons": len(_beacons),
        "sessions": len(_sessions),
        "credentials": len(_credentials)
    }


def get_collected_credentials() -> List[Dict]:
    """Get all collected credentials"""
    return _credentials.copy()


def reset():
    """Reset all state (useful for testing)"""
    global _connected, _teamserver_info, _listeners, _payloads, _beacons, _sessions, _credentials
    _connected = False
    _teamserver_info = {}
    _listeners = {}
    _payloads = {}
    _beacons = {}
    _sessions = {}
    _credentials = []
    _log("State reset")


# =============================================================================
# Robot Framework Keyword Aliases
# =============================================================================

def GetUID(session) -> str:
    """
    Alias for run_getuid — matches Robot keyword name

    Robot Keyword: GetUID
    """
    return run_getuid(session)


def Initial_Access(target_ip: str, username: str, password: str, beacon_path: str) -> Dict[str, Any]:
    """
    Simulates initial access — SCP file and execute via SSH

    Robot Keyword: Initial_Access
    """
    _log(f"Performing initial access to {target_ip}...")
    _log(f"  Username: {username}")
    _log(f"  Beacon: {beacon_path}")

    time.sleep(0.5)

    _log(f"  Uploading beacon via SCP...")
    time.sleep(0.3)

    _log(f"  Executing beacon via SSH...")
    time.sleep(0.3)

    session = _create_mock_session(
        ip=target_ip,
        username=username,
        listener="HTTP"
    )

    _log(f"  Initial access successful")
    _log(f"  Beacon ID: {session['beacon_id']}")

    return {
        "success": True,
        "target_ip": target_ip,
        "beacon_id": session['beacon_id'],
        "session": session
    }


# =============================================================================
# Main (for testing)
# =============================================================================

if __name__ == "__main__":
    print("Testing Mock Cobalt Strike Library")
    print("=" * 60)

    result = start_c2("10.50.100.5", 50050, "operator", "password123")
    print(f"\n[1] Connect: {result['status']}")

    listener = create_listener("HTTP", 80, "Beacon_HTTP", "10.50.100.5")
    print(f"\n[2] Listener: {listener['name']} on port {listener['port']}")

    payload_path = create_payload("beacon", "exe", "HTTP", "/tmp/payloads")
    print(f"\n[3] Payload: {payload_path}")

    result = Initial_Access("192.168.1.100", "Administrator", "P@ssw0rd", payload_path)
    print(f"\n[4] Initial Access: Beacon {result['beacon_id']} @ {result['target_ip']}")

    sessions = get_sessions_by_ip("192.168.1.100")
    session = sessions[0]
    print(f"\n[5] Session: {session}")

    uid = GetUID(session)
    print(f"\n[6] GetUID: {uid}")

    result = run_mimikatz(session)
    print(f"\n[7] Mimikatz: Found {len(result['credentials'])} credentials")
    for c in result['credentials']:
        print(f"    - {c['domain']}\\{c['username']}")

    result = Lateral_Move_Psexec(session, "192.168.1.200", "HTTP")
    new_session = result['result']
    print(f"\n[8] Lateral Move: {new_session['beacon_id']} @ {result['target_ip']}")

    uid2 = GetUID(new_session)
    print(f"\n[9] GetUID (Target 2): {uid2}")

    status = get_status()
    print(f"\n[10] Status: sessions={status['sessions']} creds={status['credentials']}")

    result = stop_c2()
    print(f"\n[11] Disconnect: {result['status']}")

    print("\n" + "=" * 60)
    print("All tests passed!")