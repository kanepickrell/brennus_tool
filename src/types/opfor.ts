// ============================================================================
// OPFOR Type Definitions
// ============================================================================

export type MitreTactic =
  | 'TA0043' // Reconnaissance
  | 'TA0042' // Resource Development
  | 'TA0001' // Initial Access
  | 'TA0002' // Execution
  | 'TA0003' // Persistence
  | 'TA0004' // Privilege Escalation
  | 'TA0005' // Defense Evasion
  | 'TA0006' // Credential Access
  | 'TA0007' // Discovery
  | 'TA0008' // Lateral Movement
  | 'TA0009' // Collection
  | 'TA0010' // Exfiltration
  | 'TA0011' // Command and Control
  | 'TA0040' // Impact
  | 'control'; // Control flow / orchestration

export type ExecutionType =
  | 'cobalt_strike'
  | 'robot_framework'
  | 'robot_utility'
  | 'shell_command'
  | 'orchestration';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type NodeValidationState =
  | 'unconfigured'
  | 'configured'
  | 'validated'
  | 'executing'
  | 'success'
  | 'failed';

export type {
  RangeTargetKind,
  RangeTargetField,
  RangeTargetData,
  RangeTargetEmitMode,
  CanvasDragPayload,
  RangeTargetDragPayload,
} from './opforRangeTarget';

// Add this near the top of types/opfor.ts, after the MitreTactic type definition

export const tacticLabels: Record<MitreTactic, string> = {
  'TA0043': 'Reconnaissance',
  'TA0042': 'Resource Development',
  'TA0001': 'Initial Access',
  'TA0002': 'Execution',
  'TA0003': 'Persistence',
  'TA0004': 'Privilege Escalation',
  'TA0005': 'Defense Evasion',
  'TA0006': 'Credential Access',
  'TA0007': 'Discovery',
  'TA0008': 'Lateral Movement',
  'TA0009': 'Collection',
  'TA0010': 'Exfiltration',
  'TA0011': 'Command and Control',
  'TA0040': 'Impact',
  'control': 'Control Flow',
};

export interface MitreMapping {
  tacticId: string | null;
  techniqueId: string | null;
}

export interface OpforInput {
  id: string;
  label: string;
  type: string;
  required: boolean;
  description: string;
}

export interface OpforOutput {
  id: string;
  label: string;
  type: string;
  description: string;
}

export interface OpforParameter {
  id: string;
  label: string;
  type: 'string' | 'number' | 'text' | 'select' | 'file';
  required: boolean;
  placeholder: string | null;
  default: string | number | null;
  options?: string[];
  description: string;
}

export interface OpforRequirements {
  c2Server: boolean;
  listeners: string[];
  payloads: string[];
  sshConnections: string[];
  externalTools: string[];
  libraries: string[];
}

export interface OpforMetadata {
  version: string;
  lastUpdated: string;
  updatedBy: string;
  validationStatus: string;
  changeLog: string;
  owner: string;
  status: string;
  tags: string[];
}

export interface OutputObjectSchema {
  type: string;
  collection: string;
  create: boolean;
  keyStrategy: string;
  keyTemplate?: string;
  schema: Record<string, any>;
}

export interface OpforNodeDefinition {
  _key: string;
  id: string;
  name: string;
  icon: string;
  tactic: MitreTactic;
  mitre: MitreMapping;
  category: string;
  subcategory: string;
  description: string;
  riskLevel: RiskLevel;
  estimatedDuration: number;
  executionType: ExecutionType;
  cobaltStrikeCommand: string | null;
  robotKeyword: string | null;
  robotTemplate: string | null;
  robotLibrary: string | null;
  shellCommand: string | null;
  inputs: OpforInput[];
  outputs: OpforOutput[];
  parameters: OpforParameter[];
  requirements: OpforRequirements;
  metadata: OpforMetadata;
  outputObjects: OutputObjectSchema[];
  // Robot Framework configuration for script generation
  robotFramework?: {
    libraries?: string[];
    resources?: string[];
    keyword: string;
    keywordArgs?: Array<{
      param: string;
      arg: string;
      format?: string;
      transform?: 'capitalize' | 'uppercase' | 'lowercase';
      staticValue?: string;
    }>;
    variables?: Array<{
      name: string;
      fromParam?: string;
      default?: string;
      scope: 'global' | 'suite' | 'local';
    }>;
    suiteSetup?: {
      required: boolean;
      keyword: string;
      dependsOn?: string[];
    };
    documentation?: string;
    tags?: string[];
    timeout?: string;
    teardown?: string;
  };
}

export interface OpforNodeData {
  definition: OpforNodeDefinition;
  parameters: Record<string, string | number>;
  label: string;
  validationState: NodeValidationState;
}

export interface ExecutionLogEntry {
  id: string;
  timestamp: Date;
  type: 'update' | 'validation' | 'error' | 'warning' | 'export' | 'execution';
  message: string;
  details?: string;
  nodeId?: string;
  operator?: string;
}

export interface OpforGlobalSettings {
  // === Campaign Identity ===
  executionPlanName: string;
  targetNetwork: string;
  sessionId: string;
  operator: string;
  redTeam: string;
  notes: string;

  // === C2 Server ===
  /** Teamserver IP — used by cs-start-c2 Suite Setup */
  c2Server: string;
  /** Cobalt Strike username */
  csUser?: string;
  /** Cobalt Strike password */
  csPass?: string;
  /** Cobalt Strike installation directory */
  csDir?: string;
  /** Cobalt Strike team server port */
  csPort?: string;

  // === Operator Working Directory ===
  /** Operator-side working directory for payloads and artifacts.
   *  Use Robot Framework env-var syntax: %{HOME}/sandworm/
   *  Exposed as ${WORKDIR} in every generated script. */
  workdir?: string;

  // === C2 Runtime Flags ===
  /** Enable Cobalt Strike debug mode — defaults to ${False} */
  debugMode?: string;
  /** Whether sudo is required to start the teamserver — defaults to ${False} */
  sudoNeeded?: string;

  // === NOTE: The following fields have been moved to individual nodes ===
  // target1, target2      → cs-initial-access, cs-lateral-psexec (suite-scoped vars)
  // localInitialBeacon    → derived from cs-generate-payload output (${WORKDIR}${PAYLOAD_NAME}.exe)
  // artifactDir           → defaulted on cs-start-c2 as artifact/${executionPlanName}
  // payloadName/Path      → cs-generate-payload node parameters
  // targetIp/User/Pass    → cs-initial-access node parameters
  // appDataPath/runKey    → cs-persistence-registry node parameters
  // arch/scanMethod       → cs-network-enumerate node parameters

  // === Custom Campaign Variables (advanced) ===
  /** Additional variables injected verbatim into *** Variables *** section */
  customVariables?: Record<string, string>;
}

// ============================================================================
// Workflow Save/Load Types
// ============================================================================

export interface WorkflowMetadata {
  name: string;
  description: string;
  author: string;
  created: string;
  lastModified: string;
  tags: string[];
}

export interface WorkflowFile {
  version: string;
  metadata: WorkflowMetadata;
  globalSettings: OpforGlobalSettings;
  nodes: any[]; // ReactFlow Node[]
  edges: any[]; // ReactFlow Edge[]
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}