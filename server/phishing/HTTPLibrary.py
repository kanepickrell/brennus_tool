import subprocess
import os
from pathlib import Path
from robot.api.logger import info, console


class HTTPLibrary:

    ROBOT_LIBRARY_SCOPE = 'TEST SUITE'

    def __init__(self) -> None:
        self._session = None
        self.server = None
        # http_server_post.py must live alongside this file in server/phishing/
        self._server_script = Path(__file__).resolve().parent / 'http_server_post.py'

    def initiate_http_server(self, host_directory, upload_directory, port):
        """Start the HTTP payload server as a background subprocess."""
        if not self._server_script.exists():
            raise FileNotFoundError(
                f'http_server_post.py not found at: {self._server_script}'
            )
        if self.server is not None:
            console('HTTP server already running — skipping start')
            return

        self.server = subprocess.Popen(
            [
                'python3', str(self._server_script),
                '--host_directory', host_directory,
                '--upload_directory', upload_directory,
                '--port', str(port)
            ]
        )
        info(f'HTTP server started (PID {self.server.pid}) on port {port}')
        info(f'Serving from: {host_directory}')

    def terminate_http_server(self):
        """Stop the HTTP server subprocess."""
        if self.server is None:
            console('No HTTP server instance to terminate')
            return
        self.server.terminate()
        self.server.wait()
        info(f'HTTP server (PID {self.server.pid}) terminated')
        self.server = None