// src/data/ttpReferenceData.ts
//
// Reference KSA and JQS identifiers for the 318th RANS BAQT.
// Used in the TTP Tagging UI on operator-drawn PhaseGroupNodes.
//
// Source: 318th RANS BAQT mapping document.
// Only RED-PROVIDED entries are included by default — these are the ones
// an operator attack chain can actually generate evidence for.
// RANGE-PROVIDED and UNASSIGNED are included but marked accordingly
// so operators know which require infrastructure support.
//
// Future: this list will be fetched from ProtoGraph instead of hardcoded.

export type KsaType = 'Knowledge' | 'Skill' | 'Ability' | 'Task';
export type BaqtProvider = 'Red' | 'Range' | 'User Emulation' | 'Content' | 'Unassigned';
export type BaqtCoverage = 'full' | 'partial' | 'none';

export interface KsaEntry {
  id: string;
  type: KsaType;
  description: string;
  provider: BaqtProvider;
  coverage: BaqtCoverage;
  scenarioTtps: string[];   // MITRE technique IDs this KSA maps to
}

export interface JqsEntry {
  id: string;
  module: string;
  description: string;
  assessmentType: 'Verbal/Written' | 'Demonstrated';
  provider: BaqtProvider;
  coverage: BaqtCoverage;
  scenarioTtps: string[];
}

// ── KSA Reference List ────────────────────────────────────────────────────────

export const KSA_REFERENCE: KsaEntry[] = [
  // ── RED-PROVIDED (operator actions naturally generate evidence) ──
  {
    id: '1109', type: 'Task',
    description: 'Validate IDS alerts against network traffic using packet analysis tools.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1071.001', 'T1110.002', 'T1041'],
  },
  {
    id: '1113', type: 'Task',
    description: 'Identify network mapping and OS fingerprinting activities.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1016', 'T1049', 'T1135'],
  },
  {
    id: '2062', type: 'Task',
    description: 'Assist in construction of signatures on cyber defense tools in response to new/observed threats.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1110.002'],
  },
  {
    id: '2603', type: 'Task',
    description: 'Monitor operational environment and report on adversarial activities fulfilling leadership\'s PIRs.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1021.001', 'T1036.005'],
  },
  {
    id: '3431', type: 'Knowledge',
    description: 'Knowledge of OSI model and underlying network protocols (e.g., TCP/IP).',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1071.001', 'T1090.001'],
  },
  {
    id: '3508', type: 'Knowledge',
    description: 'Knowledge of structure, approach, and strategy of exploitation tools (sniffers, keyloggers) and techniques.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1059.001', 'T1056.001', 'T1197', 'T1036.005', 'T1041', 'T1560.001'],
  },
  {
    id: 'JA0030', type: 'Ability',
    description: 'Analyze Data at Rest and Data in Transit encryption methodologies and assess policies.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1071.001'],
  },
  {
    id: 'JA0073', type: 'Ability',
    description: 'Evaluate common TTPs used in malware and open-source/IC resources to identify emerging TTPs.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1059.001', 'T1197', 'T1041', 'T1203'],
  },
  {
    id: 'JA0120', type: 'Ability',
    description: 'Identify exfiltration of data in normal network traffic.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1041', 'T1560.001'],
  },
  {
    id: 'JA0317', type: 'Ability',
    description: 'Identify activity in log entries to correlate indicators of compromise.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1021.001', 'T1110.002', 'T1547.001', 'T1056.001', 'T1070.004'],
  },
  {
    id: 'JA0326', type: 'Ability',
    description: 'Identify C2 Beaconing in normal network traffic.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1071.001', 'T1021.001', 'T1049', 'T1547.001', 'T1090.001'],
  },
  {
    id: 'JK0018', type: 'Knowledge',
    description: 'Knowledge of Hexadecimal, Octal, Decimal, and binary.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1560.001'],
  },
  {
    id: 'JK0019', type: 'Knowledge',
    description: 'Knowledge of HTML source code and the intelligence that can be derived from it.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1056.001', 'T1203', 'T1491.002'],
  },
  {
    id: 'JK0045', type: 'Knowledge',
    description: 'Knowledge of TCP flags.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1090.001'],
  },
  {
    id: 'JK0059', type: 'Knowledge',
    description: 'Knowledge of User Agent Strings and the intelligence that can be derived from them.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1036.005'],
  },
  {
    id: 'JK0332', type: 'Knowledge',
    description: 'Knowledge of encryption algorithms and their implementation.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1071.001', 'T1197'],
  },
  {
    id: 'JK0336', type: 'Knowledge',
    description: 'Knowledge of structured response frameworks (MITRE ATT&CK, Kill Chain, Diamond Model).',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1059.001'],
  },
  {
    id: 'JS0026', type: 'Skill',
    description: 'Skill in using network mapping tools to analyze, identify and enumerate a network.',
    provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1016', 'T1049', 'T1135'],
  },
  // ── RANGE-PROVIDED (partial — require infrastructure) ──
  {
    id: 'JA0081', type: 'Ability',
    description: 'Evaluate rogue/unauthorized systems on a network.',
    provider: 'Range', coverage: 'partial',
    scenarioTtps: [],
  },
  {
    id: 'JK0022', type: 'Knowledge',
    description: 'Knowledge of IPv6.',
    provider: 'Range', coverage: 'partial',
    scenarioTtps: [],
  },
  {
    id: 'JK0050', type: 'Knowledge',
    description: 'Knowledge of the different DNS resource records.',
    provider: 'Range', coverage: 'partial',
    scenarioTtps: [],
  },
  // ── UNASSIGNED (gap — no provider) ──
  {
    id: 'JK0330', type: 'Knowledge',
    description: 'Knowledge of security implications of device and software configurations.',
    provider: 'Unassigned', coverage: 'none',
    scenarioTtps: [],
  },
  {
    id: 'JK0331', type: 'Knowledge',
    description: 'Knowledge of attack principles, tools, and techniques.',
    provider: 'Unassigned', coverage: 'none',
    scenarioTtps: [],
  },
  {
    id: 'JK0334', type: 'Knowledge',
    description: 'Knowledge of basic Cyber Threat Emulation concepts.',
    provider: 'Unassigned', coverage: 'none',
    scenarioTtps: [],
  },
  {
    id: '3779', type: 'Skill',
    description: 'Skill in extracting information from packet captures.',
    provider: 'Unassigned', coverage: 'none',
    scenarioTtps: [],
  },
  {
    id: 'JS0001', type: 'Skill',
    description: 'Skill in analyzing PCAP data.',
    provider: 'Unassigned', coverage: 'none',
    scenarioTtps: [],
  },
];

// ── JQS Reference List ────────────────────────────────────────────────────────

export const JQS_REFERENCE: JqsEntry[] = [
  // ── RED-PROVIDED ──
  {
    id: '1.4.3', module: 'Mod 1 – Hacking',
    description: 'Describe common techniques used to obfuscate network traffic.',
    assessmentType: 'Verbal/Written', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1071.001', 'T1090.001'],
  },
  {
    id: '1.4.8', module: 'Mod 1 – Hacking',
    description: 'Describe techniques adversaries would use to exfiltrate data.',
    assessmentType: 'Verbal/Written', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1041', 'T1560.001'],
  },
  {
    id: '1.4.11', module: 'Mod 1 – Hacking',
    description: 'Describe remote access methods and technologies.',
    assessmentType: 'Verbal/Written', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1021.001'],
  },
  {
    id: '1.5.20', module: 'Mod 1 – Analyst',
    description: 'Discuss the Pyramid of Pain in regards to detection evasion.',
    assessmentType: 'Verbal/Written', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1036.005', 'T1070.004'],
  },
  {
    id: '3.3.2', module: 'Mod 3 – Applied',
    description: 'Given a packet capture, demonstrate the ability to analyze individual layers and highlight important fields.',
    assessmentType: 'Demonstrated', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1059.001', 'T1056.001', 'T1197'],
  },
  {
    id: '3.3.9', module: 'Mod 3 – Applied',
    description: 'Given a packet capture, identify common types of scans.',
    assessmentType: 'Demonstrated', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1110.002'],
  },
  {
    id: '3.3.10', module: 'Mod 3 – Applied',
    description: "Given a packet capture, identify an attacker's initial intrusion vector into a network.",
    assessmentType: 'Demonstrated', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1021.001', 'T1110.002', 'T1203'],
  },
  {
    id: '3.3.11', module: 'Mod 3 – Applied',
    description: 'Given a packet capture, identify the following actions: Situational Awareness, Lateral Movement, Mounted Shares, Data Exfiltration.',
    assessmentType: 'Demonstrated', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1016', 'T1049', 'T1021.001', 'T1135', 'T1059.001', 'T1041', 'T1560.001'],
  },
  {
    id: '3.3.12', module: 'Mod 3 – Applied',
    description: 'Given a packet capture, identify an adversary attempting to maintain persistence on a network.',
    assessmentType: 'Demonstrated', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1071.001', 'T1547.001'],
  },
  {
    id: '3.3.13', module: 'Mod 3 – Applied',
    description: 'Demonstrate the ability to identify anomalous traffic redirection.',
    assessmentType: 'Demonstrated', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1090.001'],
  },
  {
    id: '3.4.3', module: 'Mod 3 – Capture',
    description: 'Extract an executable file from a provided PCAP file.',
    assessmentType: 'Demonstrated', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1041'],
  },
  {
    id: '3.4.7', module: 'Mod 3 – Capture',
    description: 'Demonstrate the ability to extract a suspicious file from network traffic.',
    assessmentType: 'Demonstrated', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1041'],
  },
  {
    id: '3.4.8', module: 'Mod 3 – Capture',
    description: 'Explain/define the following methods/attributes of C2 Beaconing: Protocol used, Frequency/Occurrence, Jitter.',
    assessmentType: 'Verbal/Written', provider: 'Red', coverage: 'full',
    scenarioTtps: ['T1071.001'],
  },
  // ── RANGE-PROVIDED (partial) ──
  {
    id: '1.2.6', module: 'Mod 1 – Networking',
    description: 'Describe the most common protocols used for tunneling: PPTP, SSH, IPSec, L2TP.',
    assessmentType: 'Verbal/Written', provider: 'Range', coverage: 'partial',
    scenarioTtps: ['T1090.001'],
  },
  {
    id: '3.3.14', module: 'Mod 3 – Applied',
    description: 'Given a packet capture, demonstrate the ability to identify anomalous open ports.',
    assessmentType: 'Demonstrated', provider: 'Range', coverage: 'partial',
    scenarioTtps: [],
  },
  {
    id: '4.4.5', module: 'Mod 4 – Infra',
    description: 'Describe the most common protocols used for tunneling and which support encryption: PPTP, SSH, IPSec, L2TP, L2F, SSL/TLS.',
    assessmentType: 'Verbal/Written', provider: 'Range', coverage: 'partial',
    scenarioTtps: ['T1090.001'],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** KSAs whose TTPs overlap with the given technique IDs — useful for auto-suggesting
 *  relevant identifiers when an operator tags a variation. */
export function suggestKsasForTtps(ttpIds: string[]): KsaEntry[] {
  const ttpSet = new Set(ttpIds);
  return KSA_REFERENCE.filter(k =>
    k.provider === 'Red' &&
    k.scenarioTtps.some(t => ttpSet.has(t))
  );
}

export function suggestJqsForTtps(ttpIds: string[]): JqsEntry[] {
  const ttpSet = new Set(ttpIds);
  return JQS_REFERENCE.filter(j =>
    j.provider === 'Red' &&
    j.scenarioTtps.some(t => ttpSet.has(t))
  );
}

/** Badge color per provider — used in dropdown UI */
export const PROVIDER_COLORS: Record<BaqtProvider, string> = {
  'Red':            'text-red-400 bg-red-400/10 border-red-400/30',
  'Range':          'text-blue-400 bg-blue-400/10 border-blue-400/30',
  'User Emulation': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  'Content':        'text-purple-400 bg-purple-400/10 border-purple-400/30',
  'Unassigned':     'text-zinc-500 bg-zinc-500/10 border-zinc-500/30',
};

export const TYPE_COLORS: Record<KsaType, string> = {
  'Knowledge': 'text-cyan-400',
  'Skill':     'text-green-400',
  'Ability':   'text-amber-400',
  'Task':      'text-purple-400',
};