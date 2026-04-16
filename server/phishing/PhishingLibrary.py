import os
from robot.api.logger import info, console
import subprocess


class PhishingEmail:
    """
    Email state container. All attributes are instance-level so multiple
    PhishingLibrary instances can build independent emails in the same suite.
    """
    def __init__(self) -> None:
        self.sender = ''
        self.subject = []
        self.body = ''
        self.target_list = []
        self.server = ''
        self.port = ''
        self.attachments = []


class PhishingLibrary:
    """
    Robot Framework keyword library for phishing email construction and delivery.
    Instantiate once per campaign node; each instance owns its own PhishingEmail
    state so multiple campaigns in the same suite do not collide.

    Library Args:
        smtp_cli_path:  absolute path to the smtp-cli Perl script
                        (default: <cwd>/phishing/smtp-cli)
    """

    ROBOT_LIBRARY_SCOPE = 'TEST SUITE'

    def __init__(self, smtp_cli_path: str = None) -> None:
        if smtp_cli_path is None:
            smtp_cli_path = os.path.join(os.getcwd(), "phishing", "smtp-cli")
        self._smtp_cli_path = smtp_cli_path
        self._email = PhishingEmail()

    # ── Internal reset ────────────────────────────────────────────────────────

    def reset_email(self):
        """Reset email state. Call between campaigns if reusing the library instance."""
        self._email = PhishingEmail()
        info('Email state reset')

    # ── Builder methods ───────────────────────────────────────────────────────

    def add_attachment_to_email(self, attachments):
        """Sets any attachments of the email."""
        if not attachments:
            info('No attachments added')
        else:
            self._email.attachments = ['--attach', f'{attachments}']
            info(f'Attachments set to: {attachments}')

    def add_body_to_email(self, body):
        """Sets the body of the email."""
        if 'html' in body:
            self._email.body = f'--body-html={body}'
        elif 'txt' in body:
            self._email.body = f'--data={body}'
        else:
            self._email.body = f'--body={body}'
        info(f'Body set to: {body}')

    def add_header_to_email(self, subject):
        """Sets the subject line."""
        if not subject:
            console('No header added')
        else:
            self._email.subject = ['--subject', f'{subject}']
            info(f'Subject set to: {subject}')

    def add_target_list_to_email(self, target):
        """Sets the target of the email."""
        if '@' in target:
            if ',' in target:
                self._email.target_list = target.split(",")
            else:
                self._email.target_list = ['--to', f'{target}']
        else:
            with open(target, 'r') as file:
                data = file.read().replace('\n', ',')
                target_list = data.split(",")
            target_list = '--to=' + ',--to='.join(target_list)
            self._email.target_list = target_list.split(',')
        info(f'Target set to: {self._email.target_list}')

    def change_body_to_local_url(self, body_txt, ip, port, payload_name):
        """Rewrites the http:// anchor in body_txt to point at the live HTTP server."""
        with open(body_txt, 'r') as f:
            lines = f.readlines()
        with open(body_txt, 'w') as f:
            for line in lines:
                if 'http://' in line:
                    line = (
                        f'<a href="http://{ip}:{port}/{payload_name}">'
                        f'http://{ip}:{port}/{payload_name}</a><br>\n'
                    )
                f.write(line)

    def set_sender(self, sender):
        """Sets the sender address."""
        self._email.sender = f'--from={sender}'
        info(f'Sender set to: {sender}')

    def set_server_and_port(self, server, port):
        """Sets the SMTP server and port."""
        self._email.server = f'--server={server}'
        self._email.port = f'--port={port}'
        info(f'Server set to: {server}:{port}')

    def set_target_list(self, target_list, recipient):
        """Write a single recipient into a target list file."""
        with open(target_list, 'w') as f:
            f.write(recipient)

    # ── Send ──────────────────────────────────────────────────────────────────

    def send_email(self):
        """Assemble smtp-cli args from instance state and transmit the email."""
        args = [
            self._smtp_cli_path,
            self._email.server,
            self._email.port,
            self._email.sender,
            self._email.body,
        ]
        if self._email.attachments:
            args.extend(self._email.attachments)
        args.extend(self._email.target_list)
        if self._email.subject:
            args.extend(self._email.subject)

        console(f'smtp-cli command: {" ".join(args)}')
        result = subprocess.run(args, shell=False)
        info(result)
        assert result.returncode == 1