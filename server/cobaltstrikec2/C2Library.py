from abc import ABC, abstractmethod


class CmdResult:
    def __init__(self, success: bool = False, result=None):
        self.success = success
        self.result = result


class Session:
    def __init__(
        self,
        ip=None,
        beacon_id: str = "None",
        username: str = "None",
        domain: str = "None",
        elevated: bool = False,
        sleep: int = 0,
        jitter: int = 0,
        state: str = "dead",
    ):
        self.ip = ip
        self.beacon_id = beacon_id
        self.username = username
        self.domain = domain
        self.elevated = elevated
        self.sleep = sleep
        self.jitter = jitter
        self.state = state
        self.session_state = ["dead", "active", "paused"]

    def print_all(self):
        print(
            f"ip: {self.ip}\n"
            f"beacon_id: {self.beacon_id}\n"
            f"username: {self.username}\n"
            f"domain: {self.domain}\n"
            f"elevated: {self.elevated}\n"
            f"sleep: {self.sleep}\n"
            f"jitter: {self.jitter}\n"
            f"state: {self.state}\n"
        )


class C2(ABC):

    @abstractmethod
    def start_C2(self):
        pass

    @abstractmethod
    def stop_C2(self):
        pass

    @abstractmethod
    def get_sessions(self) -> list[Session]:
        return []

    @abstractmethod
    def get_sessions_by_ip(self, ip: str) -> list[Session]:
        return []

    @abstractmethod
    def get_sessions_by_user(self, user: str) -> list[Session]:
        return []

    @abstractmethod
    def get_session_by_id(self, session_id: str) -> Session:
        return Session()

    @abstractmethod
    def session_sleep(self, session: Session, duration: int, jitter: int) -> bool:
        return False

    @abstractmethod
    def kill_session(self, session: Session) -> bool:
        return False

    @abstractmethod
    def create_payload(
        self,
        name: str,
        payload_template: str,
        listener_name: str,
        out_file: str,
        retries: int,
    ) -> str:
        return ""

    @abstractmethod
    def create_listener(
        self, name: str, port: int, listener_type: str, ip: str, host_url=None
    ) -> bool:
        return False

    @abstractmethod
    def remove_listener(self, name: str) -> bool:
        return False

    @abstractmethod
    def issue_shell_cmd(self, session: Session, cmd: str) -> CmdResult:
        return CmdResult()

    @abstractmethod
    def issue_powershell_cmd(self, session: Session, cmd: str) -> CmdResult:
        return CmdResult()

    @abstractmethod
    def issue_c2_cmd(self, session: Session, cmd: str) -> CmdResult:
        return CmdResult()

    @abstractmethod
    def runas(
        self, session: Session, username: str, password: str, domain: str, cmd: str
    ) -> CmdResult:
        return CmdResult()

    @abstractmethod
    def upload_file(self, session: Session, local_path: str, target_path: str) -> bool:
        return False

    @abstractmethod
    def download_file(
        self, session: Session, target_path: str, local_path: str
    ) -> bool:
        return False

    @abstractmethod
    def simulate_brute_force(
        self, session: Session, username: str, password: str, domain: str, reps: int
    ) -> CmdResult:
        return CmdResult()

    @abstractmethod
    def run_mimikatz(self, session: Session) -> CmdResult:
        return CmdResult()

    @abstractmethod
    def remove_beacon(self, session: Session) -> bool:
        return False

    @abstractmethod
    def remove_beacon_by_id(self, beacon_id: str) -> bool:
        return False

    @abstractmethod
    def kill_session_by_id(self, beacon_id: str) -> bool:
        return False

    @abstractmethod
    def kill_all_sessions(self, remove_after_kill: bool = False) -> dict:
        return {}

    @abstractmethod
    def respawn_session(
        self,
        session: Session,
        listener_name: str,
        payload_template: str,
        payload_output_dir: str,
        payload_name: str,
        exec_path_on_target: str,
        remove_old_entry: bool,
    ) -> bool:
        return False