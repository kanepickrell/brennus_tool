"""
cobaltstrike_module.py
----------------------
Module-level shim so main.py can do:

    from cobaltstrike_module import (
        start_c2, stop_c2, is_connected, get_teamserver_info,
        create_listener, list_listeners,
        create_payload, list_payloads,
        get_status, reset,
    )

All state lives in a single module-level `_cs` instance of the
`cobaltstrike` class.  The instance is created lazily on first
`start_c2()` call so that importing this module never crashes even
if the CS library files are absent.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Lazy import of the real cobaltstrike class
# ---------------------------------------------------------------------------

_CS_CLASS = None          # loaded once on first start_c2() call
_cs: Any = None           # the singleton instance
_connected: bool = False
_listeners_cache: List[str] = []
_payloads_cache: List[str] = []


def _load_class():
    """Import the cobaltstrike class, searching common paths."""
    global _CS_CLASS
    if _CS_CLASS is not None:
        return _CS_CLASS

    # Add server/ to sys.path so internal imports inside cobaltstrike.py work
    server_dir = Path(__file__).parent
    for candidate in [
        server_dir / "cobaltstrikec2",
        Path(os.getenv("CS_DIR", "/opt/cobaltstrike")) / "cobaltstrikec2",
        Path(os.getenv("CS_LIBRARY_DIR", "")),
    ]:
        if candidate.exists() and str(candidate.parent) not in sys.path:
            sys.path.insert(0, str(candidate.parent))

    try:
        from cobaltstrikec2.cobaltstrike import cobaltstrike as _cls
        _CS_CLASS = _cls
        return _CS_CLASS
    except ImportError as e:
        raise ImportError(
            f"Cannot import cobaltstrike class: {e}. "
            "Set CS_LIBRARY_DIR to your cobaltstrikec2/ directory."
        ) from e


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_c2(
    host: str,
    port: int = 50050,
    user: str = "operator",
    password: str = "",
    cs_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Initialise the cobaltstrike singleton and connect to the teamserver.
    Returns a dict with connection info; raises on failure.
    """
    global _cs, _connected

    cls = _load_class()

    resolved_dir = cs_dir or os.getenv("CS_DIR", "/opt/cobaltstrike")

    _cs = cls(
        local_bind_ip=host,
        user=user,
        cs_password=password,
        cs_dir=resolved_dir,
        port=port,
        debug=bool(os.getenv("DEBUG_MODE", "")),
    )

    # _configure_and_validate resolves paths and verifies the binary exists
    _cs._configure_and_validate()
    _connected = True

    return {
        "connected": True,
        "host": host,
        "port": port,
        "user": user,
        "cs_dir": resolved_dir,
    }


def stop_c2() -> Dict[str, Any]:
    """Disconnect / tear down the singleton instance."""
    global _cs, _connected, _listeners_cache, _payloads_cache
    _connected = False
    _listeners_cache = []
    _payloads_cache = []
    _cs = None
    return {"connected": False}


def is_connected() -> bool:
    return _connected and _cs is not None


def get_teamserver_info() -> Optional[Dict[str, Any]]:
    if not is_connected():
        return None
    return {
        "host": getattr(_cs, "TEAMSERVER_HOST", None),
        "port": getattr(_cs, "PORT", 50050),
        "user": getattr(_cs, "USER", ""),
        "cs_dir": getattr(_cs, "CS_DIR", ""),
    }


# ---------------------------------------------------------------------------
# Listeners
# ---------------------------------------------------------------------------

def create_listener(
    name: str,
    port: int,
    listener_type: str = "Beacon_HTTP",
    host: str = "0.0.0.0",
    bind_to: Optional[str] = None,
    profile: Optional[str] = None,
) -> Dict[str, Any]:
    _require_connected()
    ok = _cs.create_listener(
        name=name,
        port=port,
        listener_type=listener_type,
        ip=bind_to or host,
    )
    if ok:
        if name not in _listeners_cache:
            _listeners_cache.append(name)
    return {"name": name, "port": port, "type": listener_type, "created": ok}


def list_listeners() -> List[str]:
    if not is_connected():
        return []
    try:
        from cobaltstrikec2.payload_automation.striker import CSConnector
        with CSConnector(
            cs_host=_cs.TEAMSERVER_HOST,
            cs_user=f"{_cs.USER}_list_listeners",
            cs_pass=_cs.CS_PASSWORD,
            cs_directory=_cs.CS_DIR,
            cs_port=_cs.PORT,
        ) as cs:
            listeners = cs.get_listeners_stageless() or []
            return list(listeners)
    except Exception as e:
        print(f"[cobaltstrike_module] list_listeners error: {e}")
        return _listeners_cache


# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------

def create_payload(
    name: str,
    template: str,
    listener: str,
    output_dir: str,
    retries: int = 3,
    arch: str = "x64",
) -> Optional[str]:
    _require_connected()
    path = _cs.create_payload(
        name=name,
        payload_template=template,
        listener_name=listener,
        out_file=output_dir,
        _retries=retries,
        x64=(arch == "x64"),
    )
    if path and path not in _payloads_cache:
        _payloads_cache.append(path)
    return path


def list_payloads() -> List[str]:
    return list(_payloads_cache)


# ---------------------------------------------------------------------------
# Status / reset
# ---------------------------------------------------------------------------

def get_status() -> Dict[str, Any]:
    return {
        "connected": is_connected(),
        "teamserver": get_teamserver_info(),
        "listeners": len(_listeners_cache),
        "payloads": len(_payloads_cache),
    }


def reset() -> None:
    """Called on app shutdown — safe no-op if not connected."""
    global _cs, _connected, _listeners_cache, _payloads_cache
    _cs = None
    _connected = False
    _listeners_cache = []
    _payloads_cache = []


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _require_connected():
    if not is_connected():
        raise RuntimeError(
            "C2 not connected. Call start_c2() first or connect via the Infrastructure tab."
        )
