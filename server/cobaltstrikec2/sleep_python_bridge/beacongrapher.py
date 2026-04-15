#!/usr/local/bin/python3
from sleep_python_bridge.striker import CSConnector
from argparse import ArgumentParser
from pprint import pp, pprint
import json
from robot.api.logger import info, debug, trace, console

class beacongrapher:
    """
    A class to call beacongraph from within the code
    """
    def __init__(self):
        pass

    @staticmethod
    def graph(args):

        cs_host = args["host"]
        cs_port = args["port"]
        cs_user = args["username"]
        cs_pass = args["password"]
        cs_directory = args["path"]

        ####################
        ## Connect to server
        print(f"[*] Connecting to teamserver: {cs_host}")
        with CSConnector(
            cs_host=cs_host,
            cs_port=cs_port,
            cs_user=cs_user,
            cs_pass=cs_pass,
            cs_directory=cs_directory) as cs:

            beacons = cs.get_beacons()

            print("[*] Getting beacon logs from teamserver...")
            beaconsresult = beacons

        ####################
        ## Process Logs

        # JSON field reference: type, beacon_id, user, command, result, timestamp

        if beaconsresult is None:
            print("[!] No logs yet. Did you just start the teamserver?")
            exit()

        links = []

        # Add Node Icons
        for beacon in beaconsresult:
            print(beacon)

            nodeIcon = u'\uf0e7'

            if beacon["pbid"] == "":
                nodeIcon = u'\uf0e7'

            else:
                nodeIcon = u'\uf0e7'

            beacon.update({"nodeIcon":nodeIcon})
            beacon.update({"build":str(beacon["build"])})

        # Create Links
        for beacon in beaconsresult:
            beacon_source = beacon["id"]
            beacon_target = ""
            beacon_type = ""

            if beacon["phint"] == "":
                beacon_type = "HTTP"
                beacon_target = "0" # teamserver
            elif beacon["phint"] == "445":
                beacon_type = "SMB"
                beacon_target = beacon["pbid"]
            else:
                beacon_type = "TCP"
                beacon_target = beacon["pbid"]


            # Add each beacon to list
            links.append({"source":beacon_source,"target":beacon_target,"type":beacon_type})

        # Add teamserver reference
        # beaconsresult.append({
        #     'alive': 'true',
        #     'arch': '',
        #     'barch': '',
        #     'build': '0',
        #     'charset': '',
        #     'computer': '',
        #     'external': '',
        #     'host': 'teamserver',
        #     'id': '',
        #     'internal': '',
        #     'is64': '',
        #     'last': '',
        #     'lastf': '',
        #     'listener': '',
        #     'nodeIcon': '\uf0e7',
        #     'note': '',
        #     'os': 'Cobalt Strike',
        #     'pbid': '',
        #     'phint': '0',
        #     'pid': 'teamserver',
        #     'port': '',
        #     'process': 'teamserver',
        #     'session': '',
        #     'user': 'admin',
        #     'ver': 'teamserver',
        #     "nodeIcon":u'\uf233'
        #     })
        # # console(type(beacons[0]))
        # console(links)
        beacons_list = []
        # console(beaconsresult)
        # console(len(beaconsresult))
        # console(type(beaconsresult))
        for b in range(0, len(beaconsresult)):
            beacons_dict = {}
            for x in beaconsresult[b].keys():
                beacons_dict[x] = dict(beaconsresult[b])[x]
                # output = json.dumps(beacons_dict,ensure_ascii=False).encode('utf8')
                # filename = 'beacons' + str(b) + '.json'
                # with open(filename, 'wb') as the_file:
                #     the_file.write(output)
            # console(beacons_dict)
            beacons_list.append(beacons_dict)
        return beacons_list, links


def graph(args):
    return beacongrapher.graph(args)