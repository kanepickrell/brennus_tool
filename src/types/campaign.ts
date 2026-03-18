// src/types/campaign.ts
// Shared data model for LUMEN campaigns — persisted in .lumen files and localStorage index

export type C2Framework = 'cobalt_strike' | 'sliver' | 'havoc' | 'ssh' | 'shell';

export interface JQRProfile {
  id: string;
  name: string;
  requiredTactics: string[];           // TA#### codes
  requiredTechniques?: string[];       // T#### codes (optional deeper level)
  description?: string;
}

// Preset JQR profiles — replace with ATLAS lookup when available
export const JQR_PRESETS: JQRProfile[] = [
  {
    id: 'custom',
    name: 'Custom',
    requiredTactics: [],
    description: 'Define your own requirements',
  },
  {
    id: '318-op-level-1',
    name: '318 RANS Operator Level 1',
    requiredTactics: ['TA0001', 'TA0005', 'TA0006', 'TA0007', 'TA0008'],
    description: 'Entry-level operator qualification — initial access through lateral movement',
  },
  {
    id: '318-op-level-2',
    name: '318 RANS Operator Level 2',
    requiredTactics: ['TA0001', 'TA0003', 'TA0004', 'TA0005', 'TA0006', 'TA0007', 'TA0008'],
    description: 'Advanced operator — adds persistence and privilege escalation',
  },
  {
    id: '318-red-team-lead',
    name: '318 RANS Red Team Lead',
    requiredTactics: ['TA0001', 'TA0002', 'TA0003', 'TA0004', 'TA0005', 'TA0006', 'TA0007', 'TA0008', 'TA0009', 'TA0011'],
    description: 'Full-spectrum qualification — all major ATT&CK phases',
  },
  {
    id: 'hunt-scenario',
    name: 'Hunt Scenario (Hunt 1 style)',
    requiredTactics: ['TA0001', 'TA0005', 'TA0006', 'TA0007', 'TA0008', 'TA0009', 'TA0011'],
    description: 'Multi-target hunt scenario covering C2, access, discovery, and exfil',
  },
];

export interface CampaignConfig {
  // Identity
  id: string;
  name: string;
  operatorName: string;
  rangeEnvironment: string;
  createdAt: string;
  updatedAt: string;

  // JQR
  jqrProfileId: string;
  jqrProfile: JQRProfile;             // snapshot at creation time

  // C2
  c2Framework: C2Framework;
  c2Config: {
    csIp: string;
    csUser: string;
    csPass: string;
    csDir: string;
    csPort: string;
    workdir: string;
  };

  // Canvas state (saved on export)
  canvasNodes?: unknown[];
  canvasEdges?: unknown[];

  // Metadata
  nodeCount: number;
  tacticsCovered: string[];
  jqrProgress: number;                // 0–100
}

export const DEFAULT_C2_CONFIG = {
  csIp:    '10.50.100.5',
  csUser:  'operator',
  csPass:  '',
  csDir:   '/opt/cobaltstrike',
  csPort:  '50050',
  workdir: '~/sandworm/',
};

export const MITRE_TACTICS: { id: string; label: string; icon: string }[] = [
  { id: 'TA0042', label: 'Resource Development',  icon: '🏗️' },
  { id: 'TA0001', label: 'Initial Access',         icon: '🚪' },
  { id: 'TA0002', label: 'Execution',              icon: '⚡' },
  { id: 'TA0003', label: 'Persistence',            icon: '🔒' },
  { id: 'TA0004', label: 'Privilege Escalation',   icon: '👑' },
  { id: 'TA0005', label: 'Defense Evasion',        icon: '🛡️' },
  { id: 'TA0006', label: 'Credential Access',      icon: '🔑' },
  { id: 'TA0007', label: 'Discovery',              icon: '🔍' },
  { id: 'TA0008', label: 'Lateral Movement',       icon: '🚀' },
  { id: 'TA0009', label: 'Collection',             icon: '📦' },
  { id: 'TA0011', label: 'Command & Control',      icon: '📡' },
];