// src/types/libraryModule.ts
// Updated LibraryModule schema with Robot Framework execution metadata

/**
 * Parameter mapping from module parameter to Robot keyword argument
 */
export interface RobotKeywordArg {
  /** Module parameter ID (e.g., "name", "protocol") */
  param: string;
  /** Robot keyword argument name (e.g., "name", "type_name") */
  arg: string;
  /** Format string for the value (e.g., "${%s}", "Beacon_%s") */
  format?: string;
  /** Transform to apply: "capitalize", "uppercase", "lowercase" */
  transform?: 'capitalize' | 'uppercase' | 'lowercase' | 'none';
  /** Static value to use instead of parameter */
  staticValue?: string;
}

/**
 * Variable produced by this module step
 */
export interface RobotVariable {
  /** Robot variable name (e.g., "LISTENER_NAME") */
  name: string;
  /** Output ID this variable comes from */
  fromOutput?: string;
  /** Parameter ID this variable comes from */
  fromParam?: string;
  /** Scope: global persists across test cases, local is within test case */
  scope: 'global' | 'local' | 'suite';
  /** Default value if not set */
  default?: string;
}

/**
 * Suite setup requirements for this module
 */
export interface RobotSuiteSetup {
  /** Whether suite setup is required before using this module */
  required: boolean;
  /** The setup keyword to call */
  keyword?: string;
  /** Variables that must be defined before setup */
  dependsOn?: string[];
}

/**
 * Robot Framework execution metadata for a LibraryModule
 */
export interface RobotFrameworkConfig {
  /** Library imports required (e.g., "cobaltstrike.C2Keywords") */
  libraries: string[];
  /** Resource file imports (e.g., "cobaltstrike/cobaltstrike.resource") */
  resources: string[];
  /** The Robot keyword to call for this module */
  keyword: string;
  /** How module parameters map to keyword arguments */
  keywordArgs: RobotKeywordArg[];
  /** Variables this module produces/sets */
  variables: RobotVariable[];
  /** Suite setup requirements */
  suiteSetup?: RobotSuiteSetup;
  /** Documentation string for the test step */
  documentation?: string;
  /** Tags to apply to steps using this module */
  tags?: string[];
  /** Timeout for this step (e.g., "5m", "300s") */
  timeout?: string;
  /** Teardown keyword to call after this step */
  teardown?: string;
}

/**
 * Module parameter definition
 */
export interface ModuleParameter {
  id: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'boolean' | 'textarea';
  required?: boolean;
  placeholder?: string;
  default?: string | number | boolean;
  options?: string[];
  description?: string;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
  };
}

/**
 * Module input/output port definition
 */
export interface ModulePort {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  description?: string;
  multiple?: boolean;
}

/**
 * Module requirements (C2, tools, etc.)
 */
export interface ModuleRequirements {
  c2Server?: boolean;
  listeners?: string[];
  payloads?: string[];
  sshConnections?: string[];
  externalTools?: string[];
  libraries?: string[];
  /** Elevated privileges required */
  elevated?: boolean;
  /** Network connectivity required */
  network?: boolean;
}

/**
 * Module metadata
 */
export interface ModuleMetadata {
  version?: string;
  lastUpdated?: string;
  updatedBy?: string;
  validationStatus?: 'draft' | 'testing' | 'production';
  changeLog?: string;
  owner?: string;
  status?: 'draft' | 'active' | 'deprecated' | 'archived';
  tags?: string[];
}

/**
 * Complete LibraryModule artifact with Robot Framework support
 */
export interface LibraryModule {
  _key: string;
  id: string;
  name: string;
  icon?: string;
  
  /** MITRE ATT&CK tactic ID (e.g., "TA0011") */
  tactic: string;
  /** MITRE mapping details */
  mitre?: {
    tacticId: string;
    techniqueId?: string | null;
    subtechniqueId?: string | null;
  };
  
  /** Module category (e.g., "Cobalt Strike") */
  category: string;
  /** Subcategory (e.g., "Infrastructure Setup") */
  subcategory?: string;
  /** Human-readable description */
  description: string;
  
  /** Risk level for this technique */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Estimated duration in seconds */
  estimatedDuration?: number;
  
  /** Execution type determines which executor handles this */
  executionType: 'cobalt_strike' | 'robot_framework' | 'shell' | 'manual' | 'hybrid';
  
  /** Raw Cobalt Strike command template */
  cobaltStrikeCommand?: string;
  /** Shell command template (for shell executionType) */
  shellCommand?: string;
  
  /** Input ports (data dependencies) */
  inputs: ModulePort[];
  /** Output ports (data produced) */
  outputs: ModulePort[];
  /** Configurable parameters */
  parameters: ModuleParameter[];
  
  /** Execution requirements */
  requirements?: ModuleRequirements;
  /** Module metadata */
  metadata?: ModuleMetadata;
  
  /** Robot Framework execution configuration */
  robotFramework: RobotFrameworkConfig;
  
  /** Payload URL for full artifact data */
  payload_url?: string;
}

/**
 * Lightweight metadata stored in ArangoDB (without full robotFramework config)
 */
export type LibraryModuleMetadata = Omit<LibraryModule, 'robotFramework' | 'inputs' | 'outputs' | 'parameters'> & {
  payload_url: string;
};