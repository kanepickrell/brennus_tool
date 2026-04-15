import getpass
import subprocess


class SudoPass:
    sudopass: str = ''

    #def __init__(self, password=getpass.getpass("Enter [sudo] password: ")):
    def __init__(self, password='password'):
        self.sudopass = password

    def set_sudo(self, kill_on_error=False, verify_password=True, password='password') -> bool:
        """Give sudo permissions to user for sudo timeout time (default is 5 minutes)
        Keyword arguments:
            kill_on_error:boolean - Whether to kill the process after 3 password failures (default is False)
            verify_password:boolean - Whether to verify password, without this password might be wrong and
                                      fail later in the program (default is True)
        Returns True if the sudo permission is granted
        Returns False if the sudo permission is not granted
        """
        if verify_password:
            subprocess.run(['sudo', '-k'])
        for x in range(1, 3):
            proc = subprocess.Popen(['sudo', '-S', '-v'], text=True, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
            proc.communicate(f'{self.sudopass}\n')
            if self.test_sudo():
                return True
            else:
                print(f"Attempt {x}\nPassword not correct, try again")
                self.sudopass = getpass.getpass(prompt="Enter [sudo] password: ")
        if kill_on_error:
            print("Three ")
            raise PermissionError
        else:
            return False

    @staticmethod
    def test_sudo() -> bool:
        """Tests to see if user has sudo permission.
        Returns False if user does not have sudo permission (this process takes about 5 seconds)
        Returns True if user does have sudo permission and extends time (default 5 minutes)
        """
        proc = subprocess.Popen(['sudo', '-S', '-v'], text=True, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        proc.communicate('echo "\n\n\n" >')
        if proc.returncode == 0:
            return True
        else:
            return False

    def get_sudopass(self):
        return self.sudopass