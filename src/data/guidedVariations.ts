// src/data/guidedVariations.ts
// Guided mode variation cards.
// Each variation is a complete attack chain — when selected, all steps are placed
// on the canvas as connected nodes.
//
// MODULE KEY MAPPING — all keys must exactly match GraphDB _key / payload filename:
//   cs-start-c2, cs-stop-c2, cs-create-listener, cs-generate-payload,
//   cs-get-session-by-ip, cs-session-sleep, cs-kill-session,
//   cs-initial-access, cs-upload-file,
//   cs-getuid, cs-get-processes, cs-list-directory, cs-network-enumerate,
//   cs-get-arp, cs-query-registry, cs-get-pwd,
//   cs-dump-credentials, cs-elevate-spawnas, cs-inject-process,
//   cs-lateral-psexec, cs-lateral-winrm,
//   cs-persistence-registry, cs-persistence-schtasks,
//   cs-move-beacon, cs-delete-file, cs-timestomp, cs-copy-beacon,
//   cs-stage-data, cs-download-file, screenshot, cs-stop-service, brute-sim

export interface GuidedStep {
  stepNum: number;
  moduleKey: string;   // must match GraphDB _key exactly
  displayName: string;
  ttpId: string;
  ttpName: string;
  icon: string;
  tactic: string;      // MITRE tactic ID for color-coding
}

export interface GuidedVariation {
  id: string;
  phase: string;              // ATT&CK phase label
  phaseId: string;            // TA#### code
  variationIndex: number;     // 1, 2, 3 within the phase
  name: string;
  tagline: string;
  narrative: string;
  difficulty: 'standard' | 'advanced' | 'complex';
  steps: GuidedStep[];
}

export const GUIDED_VARIATIONS: GuidedVariation[] = [

  // ── INITIAL ACCESS ─────────────────────────────────────────────────────────

  {
    id: 'ia-v1-ssh-scp',
    phase: 'Initial Access',
    phaseId: 'TA0001',
    variationIndex: 1,
    name: 'SSH/SCP Direct Access',
    tagline: 'Living off trusted remote services',
    narrative: 'Payload is staged and delivered via SCP to a known SSH-accessible host. C2 listener catches the callback after execution.',
    difficulty: 'standard',
    steps: [
      { stepNum: 1, moduleKey: 'cs-generate-payload',       displayName: 'Generate Payload',          ttpId: 'T1587.001', ttpName: 'Develop Capabilities: Malware',                      icon: '📦', tactic: 'TA0042' },
      { stepNum: 2, moduleKey: 'cs-start-c2',               displayName: 'Start C2 Server',           ttpId: 'T1583.004', ttpName: 'Acquire Infrastructure: Server',                     icon: '📡', tactic: 'TA0042' },
      { stepNum: 3, moduleKey: 'cs-create-listener',        displayName: 'Create Listener',           ttpId: 'T1071.001', ttpName: 'Application Layer Protocol',                        icon: '🎧', tactic: 'TA0011' },
      { stepNum: 4, moduleKey: 'cs-upload-file',            displayName: 'Upload File',               ttpId: 'T1105',     ttpName: 'Ingress Tool Transfer',                             icon: '📤', tactic: 'TA0001' },
      { stepNum: 5, moduleKey: 'cs-initial-access',         displayName: 'Initial Access via SCP/SSH',ttpId: 'T1021.004', ttpName: 'Remote Services: SSH',                              icon: '🚪', tactic: 'TA0001' },
    ],
  },

  {
    id: 'ia-v2-phishing-registry',
    phase: 'Initial Access',
    phaseId: 'TA0001',
    variationIndex: 2,
    name: 'Phishing + Registry Persistence',
    tagline: 'Payload drop and persist before detection',
    narrative: 'Payload is delivered as a simulated phishing drop. Once executed and C2 connects, registry persistence is immediately established to survive reboots.',
    difficulty: 'standard',
    steps: [
      { stepNum: 1, moduleKey: 'cs-generate-payload',       displayName: 'Generate Payload',          ttpId: 'T1587.001', ttpName: 'Develop Capabilities: Malware',                      icon: '📦', tactic: 'TA0042' },
      { stepNum: 2, moduleKey: 'cs-start-c2',               displayName: 'Start C2 Server',           ttpId: 'T1583.004', ttpName: 'Acquire Infrastructure: Server',                     icon: '📡', tactic: 'TA0042' },
      { stepNum: 3, moduleKey: 'cs-upload-file',            displayName: 'Upload File',               ttpId: 'T1566.002', ttpName: 'Phishing: Spearphishing Attachment',                 icon: '📤', tactic: 'TA0001' },
      { stepNum: 4, moduleKey: 'cs-create-listener',        displayName: 'Create Listener',           ttpId: 'T1071.001', ttpName: 'Application Layer Protocol',                        icon: '🎧', tactic: 'TA0011' },
      { stepNum: 5, moduleKey: 'cs-persistence-registry',   displayName: 'Persistence via Registry',  ttpId: 'T1547.001', ttpName: 'Boot/Logon Autostart: Registry Run Keys',            icon: '🔒', tactic: 'TA0003' },
    ],
  },

  {
    id: 'ia-v3-bruteforce-schtasks',
    phase: 'Initial Access',
    phaseId: 'TA0001',
    variationIndex: 3,
    name: 'Brute Force + Scheduled Task',
    tagline: 'Credential-based entry with scheduled persistence',
    narrative: 'Credentials are obtained via brute force simulation, SSH is used to gain access, payload is uploaded, and a scheduled task ensures persistent re-execution.',
    difficulty: 'complex',
    steps: [
      { stepNum: 1, moduleKey: 'cs-start-c2',               displayName: 'Start C2 Server',           ttpId: 'T1583.004', ttpName: 'Acquire Infrastructure: Server',                     icon: '📡', tactic: 'TA0042' },
      { stepNum: 2, moduleKey: 'cs-generate-payload',       displayName: 'Generate Payload',          ttpId: 'T1587.001', ttpName: 'Develop Capabilities: Malware',                      icon: '📦', tactic: 'TA0042' },
      { stepNum: 3, moduleKey: 'brute-sim',                 displayName: 'Brute Force Sim',           ttpId: 'T1110.001', ttpName: 'Brute Force: Password Guessing',                     icon: '🔨', tactic: 'TA0006' },
      { stepNum: 4, moduleKey: 'cs-initial-access',         displayName: 'Initial Access via SCP/SSH',ttpId: 'T1021.004', ttpName: 'Remote Services: SSH',                              icon: '🚪', tactic: 'TA0001' },
      { stepNum: 5, moduleKey: 'cs-upload-file',            displayName: 'Upload File',               ttpId: 'T1105',     ttpName: 'Ingress Tool Transfer',                             icon: '📤', tactic: 'TA0001' },
      { stepNum: 6, moduleKey: 'cs-persistence-schtasks',   displayName: 'Persistence via Schtasks',  ttpId: 'T1053.005', ttpName: 'Scheduled Task/Job: Scheduled Task',                 icon: '⏰', tactic: 'TA0003' },
    ],
  },

  // ── DISCOVERY ──────────────────────────────────────────────────────────────

  {
    id: 'disc-v1-domain-enum',
    phase: 'Discovery',
    phaseId: 'TA0007',
    variationIndex: 1,
    name: 'Domain Enumeration',
    tagline: 'Passive recon of AD structure',
    narrative: 'Network config is captured, ARP table maps adjacent hosts, processes are enumerated, and domain controller presence is confirmed via registry queries.',
    difficulty: 'standard',
    steps: [
      { stepNum: 1, moduleKey: 'cs-getuid',                 displayName: 'Get UID',                   ttpId: 'T1033',     ttpName: 'System Owner/User Discovery',                       icon: '👤', tactic: 'TA0007' },
      { stepNum: 2, moduleKey: 'cs-get-arp',                displayName: 'Get ARP Table',             ttpId: 'T1016',     ttpName: 'System Network Configuration Discovery',            icon: '🌐', tactic: 'TA0007' },
      { stepNum: 3, moduleKey: 'cs-network-enumerate',      displayName: 'Network Enumerate',         ttpId: 'T1046',     ttpName: 'Network Service Discovery',                         icon: '🔍', tactic: 'TA0007' },
      { stepNum: 4, moduleKey: 'cs-get-processes',          displayName: 'Get Processes',             ttpId: 'T1057',     ttpName: 'Process Discovery',                                 icon: '💻', tactic: 'TA0007' },
    ],
  },

  {
    id: 'disc-v2-dns-sweep',
    phase: 'Discovery',
    phaseId: 'TA0007',
    variationIndex: 2,
    name: 'DNS Sweep + Host Profiling',
    tagline: 'Map the environment via DNS before moving',
    narrative: 'ARP data and network enumeration map adjacent hosts, followed by directory and registry queries to build a target profile before lateral movement.',
    difficulty: 'standard',
    steps: [
      { stepNum: 1, moduleKey: 'cs-get-arp',                displayName: 'Get ARP Table',             ttpId: 'T1016',     ttpName: 'System Network Configuration Discovery',            icon: '🌐', tactic: 'TA0007' },
      { stepNum: 2, moduleKey: 'cs-network-enumerate',      displayName: 'Network Enumerate',         ttpId: 'T1046',     ttpName: 'Network Service Discovery',                         icon: '🔍', tactic: 'TA0007' },
      { stepNum: 3, moduleKey: 'cs-list-directory',         displayName: 'List Directory',            ttpId: 'T1083',     ttpName: 'File and Directory Discovery',                      icon: '📁', tactic: 'TA0007' },
      { stepNum: 4, moduleKey: 'cs-query-registry',         displayName: 'Query Registry',            ttpId: 'T1012',     ttpName: 'Query Registry',                                    icon: '🏷️', tactic: 'TA0007' },
    ],
  },

  {
    id: 'disc-v3-bloodhound',
    phase: 'Discovery',
    phaseId: 'TA0007',
    variationIndex: 3,
    name: 'Full System Recon',
    tagline: 'Complete host and network fingerprint',
    narrative: 'Full recon sweep — UID, processes, working directory, ARP table, and network scan combine to build a complete picture of the target environment.',
    difficulty: 'advanced',
    steps: [
      { stepNum: 1, moduleKey: 'cs-getuid',                 displayName: 'Get UID',                   ttpId: 'T1033',     ttpName: 'System Owner/User Discovery',                       icon: '👤', tactic: 'TA0007' },
      { stepNum: 2, moduleKey: 'cs-get-processes',          displayName: 'Get Processes',             ttpId: 'T1057',     ttpName: 'Process Discovery',                                 icon: '💻', tactic: 'TA0007' },
      { stepNum: 3, moduleKey: 'cs-get-pwd',                displayName: 'Get Working Directory',     ttpId: 'T1083',     ttpName: 'File and Directory Discovery',                      icon: '📂', tactic: 'TA0007' },
      { stepNum: 4, moduleKey: 'cs-get-arp',                displayName: 'Get ARP Table',             ttpId: 'T1016',     ttpName: 'System Network Configuration Discovery',            icon: '🌐', tactic: 'TA0007' },
      { stepNum: 5, moduleKey: 'cs-network-enumerate',      displayName: 'Network Enumerate',         ttpId: 'T1046',     ttpName: 'Network Service Discovery',                         icon: '🔍', tactic: 'TA0007' },
    ],
  },

  // ── LATERAL MOVEMENT ───────────────────────────────────────────────────────

  {
    id: 'lm-v1-wmic-pivot',
    phase: 'Lateral Movement',
    phaseId: 'TA0008',
    variationIndex: 1,
    name: 'Elevate + Inject Pivot',
    tagline: 'Privilege escalation then process injection',
    narrative: 'Credentials are elevated via spawnas to gain a privileged context, then beacon is injected into a target process to operate from a trusted execution space.',
    difficulty: 'advanced',
    steps: [
      { stepNum: 1, moduleKey: 'cs-dump-credentials',       displayName: 'Dump Credentials',          ttpId: 'T1003.001', ttpName: 'OS Credential Dumping: LSASS',                     icon: '🔑', tactic: 'TA0006' },
      { stepNum: 2, moduleKey: 'cs-elevate-spawnas',        displayName: 'Elevate With Spawnas',      ttpId: 'T1134.002', ttpName: 'Access Token Manipulation: Spawnas',                icon: '👑', tactic: 'TA0004' },
      { stepNum: 3, moduleKey: 'cs-inject-process',         displayName: 'Inject Process',            ttpId: 'T1055',     ttpName: 'Process Injection',                                icon: '🔀', tactic: 'TA0004' },
    ],
  },

  {
    id: 'lm-v2-psexec',
    phase: 'Lateral Movement',
    phaseId: 'TA0008',
    variationIndex: 2,
    name: 'PsExec Service Move',
    tagline: 'Classic service-based lateral execution',
    narrative: 'Credentials are dumped, then PsExec spawns a SYSTEM beacon on the lateral target. A secondary beacon is uploaded to ensure redundant C2 access.',
    difficulty: 'standard',
    steps: [
      { stepNum: 1, moduleKey: 'cs-dump-credentials',       displayName: 'Dump Credentials',          ttpId: 'T1003.001', ttpName: 'OS Credential Dumping: LSASS',                     icon: '🔑', tactic: 'TA0006' },
      { stepNum: 2, moduleKey: 'cs-lateral-psexec',         displayName: 'Lateral Move PsExec64',     ttpId: 'T1021.002', ttpName: 'Remote Services: SMB/Windows Admin Shares',        icon: '🔀', tactic: 'TA0008' },
      { stepNum: 3, moduleKey: 'cs-upload-file',            displayName: 'Upload Beacon',             ttpId: 'T1105',     ttpName: 'Ingress Tool Transfer',                            icon: '📤', tactic: 'TA0001' },
    ],
  },

  {
    id: 'lm-v3-winrm',
    phase: 'Lateral Movement',
    phaseId: 'TA0008',
    variationIndex: 3,
    name: 'WinRM + Credential Harvest',
    tagline: 'Remote management protocol pivot',
    narrative: 'Credentials are harvested from LSASS, then WinRM is used to move to a lateral target. Session sleep reduces beacon noise during the pivot.',
    difficulty: 'complex',
    steps: [
      { stepNum: 1, moduleKey: 'cs-dump-credentials',       displayName: 'Dump Credentials',          ttpId: 'T1003.001', ttpName: 'OS Credential Dumping: LSASS',                     icon: '🔑', tactic: 'TA0006' },
      { stepNum: 2, moduleKey: 'cs-lateral-winrm',          displayName: 'Lateral Move WinRM',        ttpId: 'T1021.006', ttpName: 'Remote Services: WinRM',                           icon: '🔀', tactic: 'TA0008' },
      { stepNum: 3, moduleKey: 'cs-session-sleep',          displayName: 'Session Sleep',             ttpId: 'T1029',     ttpName: 'Scheduled Transfer',                               icon: '😴', tactic: 'TA0011' },
      { stepNum: 4, moduleKey: 'cs-get-processes',          displayName: 'Get Processes',             ttpId: 'T1057',     ttpName: 'Process Discovery',                                icon: '💻', tactic: 'TA0007' },
    ],
  },

  // ── CREDENTIAL ACCESS ──────────────────────────────────────────────────────

  {
    id: 'ca-v1-mimikatz',
    phase: 'Credential Access',
    phaseId: 'TA0006',
    variationIndex: 1,
    name: 'Mimikatz Memory Dump',
    tagline: 'Direct credential extraction from LSASS',
    narrative: 'Cobalt Strike injects Mimikatz directly into memory to extract plaintext credentials and NTLM hashes from the LSASS process without touching disk.',
    difficulty: 'standard',
    steps: [
      { stepNum: 1, moduleKey: 'cs-dump-credentials',       displayName: 'Dump Credentials',          ttpId: 'T1003.001', ttpName: 'OS Credential Dumping: LSASS',                     icon: '🔑', tactic: 'TA0006' },
    ],
  },

  {
    id: 'ca-v2-elevate-dump',
    phase: 'Credential Access',
    phaseId: 'TA0006',
    variationIndex: 2,
    name: 'Elevate + Dump',
    tagline: 'Privileged credential extraction',
    narrative: 'Beacon is elevated to a privileged context via spawnas before dumping credentials, ensuring access to domain-level hashes beyond the current user scope.',
    difficulty: 'advanced',
    steps: [
      { stepNum: 1, moduleKey: 'cs-getuid',                 displayName: 'Get UID',                   ttpId: 'T1033',     ttpName: 'System Owner/User Discovery',                      icon: '👤', tactic: 'TA0007' },
      { stepNum: 2, moduleKey: 'cs-elevate-spawnas',        displayName: 'Elevate With Spawnas',      ttpId: 'T1134.002', ttpName: 'Access Token Manipulation: Spawnas',               icon: '👑', tactic: 'TA0004' },
      { stepNum: 3, moduleKey: 'cs-dump-credentials',       displayName: 'Dump Credentials',          ttpId: 'T1003.001', ttpName: 'OS Credential Dumping: LSASS',                     icon: '🔑', tactic: 'TA0006' },
    ],
  },

  {
    id: 'ca-v3-brute-sim',
    phase: 'Credential Access',
    phaseId: 'TA0006',
    variationIndex: 3,
    name: 'Brute Force Simulation',
    tagline: 'Credential spray against domain accounts',
    narrative: 'A brute force simulation is executed against domain accounts with configurable attempt count and delay. Successful entries are then used to establish a session.',
    difficulty: 'advanced',
    steps: [
      { stepNum: 1, moduleKey: 'brute-sim',                 displayName: 'Brute Force Sim',           ttpId: 'T1110.001', ttpName: 'Brute Force: Password Guessing',                   icon: '🔨', tactic: 'TA0006' },
      { stepNum: 2, moduleKey: 'cs-get-session-by-ip',      displayName: 'Get Session By IP',         ttpId: 'T1078',     ttpName: 'Valid Accounts',                                   icon: '🔗', tactic: 'TA0011' },
      { stepNum: 3, moduleKey: 'cs-getuid',                 displayName: 'Get UID',                   ttpId: 'T1033',     ttpName: 'System Owner/User Discovery',                      icon: '👤', tactic: 'TA0007' },
    ],
  },

  // ── PERSISTENCE ────────────────────────────────────────────────────────────

  {
    id: 'per-v1-registry',
    phase: 'Persistence',
    phaseId: 'TA0003',
    variationIndex: 1,
    name: 'Registry Run Key',
    tagline: 'Classic autostart via registry',
    narrative: 'A registry run key is created pointing to the payload. Executes on every user logon with no additional privileges required.',
    difficulty: 'standard',
    steps: [
      { stepNum: 1, moduleKey: 'cs-upload-file',            displayName: 'Stage Payload',             ttpId: 'T1105',     ttpName: 'Ingress Tool Transfer',                            icon: '📤', tactic: 'TA0001' },
      { stepNum: 2, moduleKey: 'cs-copy-beacon',            displayName: 'Copy Beacon',               ttpId: 'T1036',     ttpName: 'Masquerading',                                     icon: '📋', tactic: 'TA0005' },
      { stepNum: 3, moduleKey: 'cs-persistence-registry',   displayName: 'Registry Run Key',          ttpId: 'T1547.001', ttpName: 'Boot/Logon Autostart: Registry Run Keys',          icon: '🔒', tactic: 'TA0003' },
      { stepNum: 4, moduleKey: 'cs-query-registry',         displayName: 'Verify Registry Key',       ttpId: 'T1012',     ttpName: 'Query Registry',                                   icon: '🔍', tactic: 'TA0007' },
    ],
  },

  {
    id: 'per-v2-schtasks',
    phase: 'Persistence',
    phaseId: 'TA0003',
    variationIndex: 2,
    name: 'Scheduled Task Persist',
    tagline: 'Time-triggered re-execution',
    narrative: 'A scheduled task is created to re-execute the payload on a recurring schedule. Survives reboots and user logoffs without requiring registry modification.',
    difficulty: 'standard',
    steps: [
      { stepNum: 1, moduleKey: 'cs-upload-file',            displayName: 'Stage Payload',             ttpId: 'T1105',     ttpName: 'Ingress Tool Transfer',                            icon: '📤', tactic: 'TA0001' },
      { stepNum: 2, moduleKey: 'cs-persistence-schtasks',   displayName: 'Create Scheduled Task',     ttpId: 'T1053.005', ttpName: 'Scheduled Task/Job: Scheduled Task',               icon: '⏰', tactic: 'TA0003' },
    ],
  },

  {
    id: 'per-v3-evasion-persist',
    phase: 'Persistence',
    phaseId: 'TA0003',
    variationIndex: 3,
    name: 'Evasive Persistence',
    tagline: 'Persist and cover tracks',
    narrative: 'Beacon is copied to a stable location, persistence is established via registry, then timestomping and file deletion remove forensic indicators.',
    difficulty: 'complex',
    steps: [
      { stepNum: 1, moduleKey: 'cs-copy-beacon',            displayName: 'Copy Beacon',               ttpId: 'T1036',     ttpName: 'Masquerading',                                     icon: '📋', tactic: 'TA0005' },
      { stepNum: 2, moduleKey: 'cs-persistence-registry',   displayName: 'Registry Persistence',      ttpId: 'T1547.001', ttpName: 'Boot/Logon Autostart: Registry Run Keys',          icon: '🔒', tactic: 'TA0003' },
      { stepNum: 3, moduleKey: 'cs-timestomp',              displayName: 'Timestomp File',            ttpId: 'T1070.006', ttpName: 'Indicator Removal: Timestomp',                     icon: '⏱️', tactic: 'TA0005' },
      { stepNum: 4, moduleKey: 'cs-delete-file',            displayName: 'Delete Artifacts',          ttpId: 'T1070.004', ttpName: 'Indicator Removal: File Deletion',                 icon: '🗑️', tactic: 'TA0005' },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get all unique phases in display order */
export const GUIDED_PHASES = [
  { id: 'TA0001', label: 'Initial Access',     icon: '🚪' },
  { id: 'TA0007', label: 'Discovery',          icon: '🔍' },
  { id: 'TA0008', label: 'Lateral Movement',   icon: '🚀' },
  { id: 'TA0006', label: 'Credential Access',  icon: '🔑' },
  { id: 'TA0003', label: 'Persistence',        icon: '🔒' },
];

/** Get variations for a given phase */
export function getVariationsForPhase(phaseId: string): GuidedVariation[] {
  return GUIDED_VARIATIONS.filter(v => v.phaseId === phaseId);
}

/** Tactic color map for step row badges */
export const TACTIC_COLORS: Record<string, string> = {
  'TA0042': 'text-teal-400   bg-teal-400/10   border-teal-400/30',
  'TA0001': 'text-blue-400   bg-blue-400/10   border-blue-400/30',
  'TA0002': 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  'TA0003': 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  'TA0004': 'text-pink-400   bg-pink-400/10   border-pink-400/30',
  'TA0005': 'text-indigo-400 bg-indigo-400/10 border-indigo-400/30',
  'TA0006': 'text-red-400    bg-red-400/10    border-red-400/30',
  'TA0007': 'text-green-400  bg-green-400/10  border-green-400/30',
  'TA0008': 'text-violet-400 bg-violet-400/10 border-violet-400/30',
  'TA0009': 'text-cyan-400   bg-cyan-400/10   border-cyan-400/30',
  'TA0011': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
};

export const DIFFICULTY_CONFIG = {
  standard: { label: 'Standard', color: 'text-green-400  bg-green-400/10  border-green-400/30'  },
  advanced: { label: 'Advanced', color: 'text-amber-400  bg-amber-400/10  border-amber-400/30'  },
  complex:  { label: 'Complex',  color: 'text-red-400    bg-red-400/10    border-red-400/30'    },
};