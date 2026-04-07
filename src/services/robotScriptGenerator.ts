// src/services/robotScriptGenerator.ts
// Generates Robot Framework scripts from Operator workflow canvas
// NO HARDCODED VALUES - all config comes from globalSettings or node parameters
// IMPORTANT: Only connected/chained nodes appear in Test Cases
// IMPORTANT: Each node instance gets unique variable names to avoid collisions
// IMPORTANT: Variable references auto-resolve based on canvas connections

import { Node, Edge } from '@xyflow/react';
import { OpforNodeData, OpforGlobalSettings } from '@/types/opfor';

// ── Static library map ────────────────────────────────────────────────────────
// Maps each module _key to the Robot Framework Library imports it needs.
// This is the source-of-truth fallback used when a node's robotFramework.libraries
// is empty (e.g. the node was placed before the updated payload JSON was deployed).
//
// Rules:
//   - cobaltstrikec2/cobaltstrike.py is needed by every CS module.
//   - SSHLibrary + SCPLibrary are ONLY needed by cs-initial-access (SCP delivery).
//   - Process, OperatingSystem, Collections, DateTime, String, CSVLibrary,
//     LogLibrary.py are internal to the cobaltstrike.py library itself —
//     they do NOT need to be imported at the .robot level.
//   - Add new module keys here whenever a new payload JSON is created.
// ─────────────────────────────────────────────────────────────────────────────
const MODULE_LIBRARIES: Record<string, string[]> = {
  'cs-start-c2':              ['cobaltstrikec2/cobaltstrike.py'],
  'cs-stop-c2':               ['cobaltstrikec2/cobaltstrike.py'],
  'cs-create-listener':       ['cobaltstrikec2/cobaltstrike.py'],
  'cs-generate-payload':      ['cobaltstrikec2/cobaltstrike.py'],
  'cs-initial-access':        ['cobaltstrikec2/cobaltstrike.py', 'SSHLibrary', 'SCPLibrary'],
  'cs-session-sleep':         ['cobaltstrikec2/cobaltstrike.py'],
  'cs-upload-file':           ['cobaltstrikec2/cobaltstrike.py'],
  'cs-timestomp':             ['cobaltstrikec2/cobaltstrike.py'],
  'cs-stop-service':          ['cobaltstrikec2/cobaltstrike.py'],
  'cs-stage-data':            ['cobaltstrikec2/cobaltstrike.py'],
  'cs-query-registry':        ['cobaltstrikec2/cobaltstrike.py'],
  'cs-persistence-schtasks':  ['cobaltstrikec2/cobaltstrike.py'],
  'cs-persistence-registry':  ['cobaltstrikec2/cobaltstrike.py'],
  'cs-lateral-psexec':        ['cobaltstrikec2/cobaltstrike.py'],
  'cs-lateral-winrm':         ['cobaltstrikec2/cobaltstrike.py'],
  'cs-dump-credentials':      ['cobaltstrikec2/cobaltstrike.py'],
  'cs-elevate-spawnas':       ['cobaltstrikec2/cobaltstrike.py'],
  'cs-inject-process':        ['cobaltstrikec2/cobaltstrike.py'],
  'cs-get-processes':         ['cobaltstrikec2/cobaltstrike.py'],
  'cs-getuid':                ['cobaltstrikec2/cobaltstrike.py'],
  'cs-get-pwd':               ['cobaltstrikec2/cobaltstrike.py'],
  'cs-get-arp':               ['cobaltstrikec2/cobaltstrike.py'],
  'cs-list-directory':        ['cobaltstrikec2/cobaltstrike.py'],
  'cs-network-enumerate':     ['cobaltstrikec2/cobaltstrike.py'],
  'cs-move-beacon':           ['cobaltstrikec2/cobaltstrike.py'],
  'cs-copy-beacon':           ['cobaltstrikec2/cobaltstrike.py'],
  'cs-delete-file':           ['cobaltstrikec2/cobaltstrike.py'],
  'cs-download-file':         ['cobaltstrikec2/cobaltstrike.py'],
  'cs-get-session-by-ip':     ['cobaltstrikec2/cobaltstrike.py'],
  'cs-kill-session':          ['cobaltstrikec2/cobaltstrike.py'],
  'brute-sim':                ['cobaltstrikec2/cobaltstrike.py'],
  'screenshot':               ['cobaltstrikec2/cobaltstrike.py'],
};

// ── Static suite-variable fallback map ───────────────────────────────────────
// Mirrors the robotFramework.variables[] arrays in each payload JSON.
// Used as a Tier 3 fallback when a node was placed on canvas BEFORE the current
// payload JSON was deployed (stale baked-in definition). The generator merges
// these defaults into the node's variable block when the node's own variables
// array is empty or missing the key.
//
// Entry format:  moduleKey → [ { name, fromParam?, default? } ]
// fromParam: read from node.parameters[fromParam] at generation time
// default:   hardcoded fallback value
// ─────────────────────────────────────────────────────────────────────────────
interface StaticVarDef { name: string; fromParam?: string; default?: string; scope: 'suite' }
const MODULE_SUITE_VARS: Record<string, StaticVarDef[]> = {
  'cs-create-listener': [
    { name: 'HTTP_LISTENER',      fromParam: 'listenerName',  default: 'HTTP',         scope: 'suite' },
    { name: 'HTTP_LISTENER_PORT', fromParam: 'listenerPort',  default: '80',           scope: 'suite' },
    { name: 'HTTP_LISTENER_TYPE', fromParam: 'listenerType',  default: 'Beacon_HTTP',  scope: 'suite' },
  ],
  'cs-generate-payload': [
    { name: 'HTTP_PAYLOAD_NAME', fromParam: 'payloadName', default: 'update', scope: 'suite' },
  ],
  'cs-initial-access': [
    { name: 'TARGET1', fromParam: 'targetIp', default: '172.16.2.5', scope: 'suite' },
  ],
  'cs-lateral-psexec': [
    { name: 'TARGET2', fromParam: 'targetIp', default: '172.16.2.3', scope: 'suite' },
  ],
  'cs-persistence-registry': [
    { name: 'APPDATA_PATH', fromParam: 'appdataPath', default: 'AppData\\Local\\Temp',                                            scope: 'suite' },
    { name: 'RUN_KEY',      fromParam: 'runKey',       default: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', scope: 'suite' },
  ],
  'cs-network-enumerate': [
    { name: 'SCAN_METHOD', fromParam: 'scanMethod', default: 'portscan', scope: 'suite' },
    { name: 'ARCH',        fromParam: 'arch',        default: 'x64',     scope: 'suite' },
  ],
  'cs-stage-data': [
    { name: 'SOURCE_PATH', fromParam: 'sourcePath', default: 'C:\\Users\\*\\Documents',         scope: 'suite' },
    { name: 'DEST_PATH',   fromParam: 'destPath',   default: 'C:\\Windows\\Temp\\staged.zip',  scope: 'suite' },
  ],
};

/**
 * Generated Robot Framework script sections
 */
export interface RobotScript {
  settings: string;
  variables: string;
  testCases: string;
  keywords: string;
  full: string;
  warnings: string[];
  missingDeps: string[];
  meta: {
    totalNodes: number;
    connectedNodes: number;
    stagedNodes: number;
    hasExecutionChain: boolean;
  };
}

interface KeywordArg {
  param?: string;
  globalSetting?: string;
  staticValue?: string;
  position: number;
  variableRef?: boolean;
  variableName?: string;
  sessionVariable?: string;
  fromInput?: string;
  /** If true, emit as named arg: argName=${VALUE} */
  named?: boolean;
  /** The named arg label, e.g. "ip" → "ip=${CS_IP}" */
  argName?: string;
}

interface VariableDefinition {
  name: string;
  fromParam?: string;
  fromGlobalSetting?: string;
  fromInput?: string;
  scope: 'global' | 'local' | 'suite';
  default?: string;
}

interface RobotFrameworkConfig {
  libraries?: string[];
  resources?: string[];
  keyword: string;
  keywordArgs?: KeywordArg[];
  variables?: VariableDefinition[];
  preKeywordLog?: string;
  postKeywordLog?: string;
  captureOutput?: string;
  isTeardown?: boolean;
  /** Node is a Suite Setup — emitted in Settings, skipped in test body */
  isSuiteSetup?: boolean;
  /** Node is a Suite Teardown — emitted in Settings, skipped in test body */
  isSuiteTeardown?: boolean;
  preKeywordStatements?: string[];
  postKeywordStatements?: string[];
  captureOutputAsList?: boolean;
  sessionVariable?: string;
}

interface NodeInstance {
  node: Node;
  instanceIndex: number;
  moduleId: string;
  variablePrefix: string;
}

interface ConnectionContext {
  inputSources: Map<string, Map<string, string>>;
  outputTargets: Map<string, Map<string, string[]>>;
}

interface SessionContext {
  currentSessionVariable: string | null;
  producerNodeId: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConnectedNodes(nodes: Node[], edges: Edge[]): Set<string> {
  const connectedIds = new Set<string>();
  edges.forEach(edge => {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  });
  return connectedIds;
}

function buildConnectionContext(edges: Edge[]): ConnectionContext {
  const inputSources = new Map<string, Map<string, string>>();
  const outputTargets = new Map<string, Map<string, string[]>>();

  edges.forEach(edge => {
    if (!inputSources.has(edge.target)) {
      inputSources.set(edge.target, new Map());
    }
    const targetInputHandle = edge.targetHandle || 'default';
    inputSources.get(edge.target)!.set(targetInputHandle, edge.source);

    if (!outputTargets.has(edge.source)) {
      outputTargets.set(edge.source, new Map());
    }
    const sourceOutputHandle = edge.sourceHandle || 'default';
    if (!outputTargets.get(edge.source)!.has(sourceOutputHandle)) {
      outputTargets.get(edge.source)!.set(sourceOutputHandle, []);
    }
    outputTargets.get(edge.source)!.get(sourceOutputHandle)!.push(edge.target);
  });

  return { inputSources, outputTargets };
}

function topologicalSort(nodes: Node[], edges: Edge[]): Node[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  });

  edges.forEach(e => {
    if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
      adjacency.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  });

  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) queue.push(nodeId);
  });

  const sorted: Node[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (node) sorted.push(node);

    adjacency.get(nodeId)?.forEach(neighbor => {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    });
  }

  return sorted.length === nodes.length ? sorted : nodes;
}

function buildNodeInstances(nodes: Node[]): Map<string, NodeInstance> {
  const instances = new Map<string, NodeInstance>();
  const moduleCount = new Map<string, number>();

  nodes.forEach(node => {
    const data = node.data as OpforNodeData;
    if (!data?.definition) return;

    const moduleId = data.definition.id || data.definition._key || 'unknown';
    const count = (moduleCount.get(moduleId) || 0) + 1;
    moduleCount.set(moduleId, count);

    const variablePrefix = count === 1 ? '' : `_${count}`;

    instances.set(node.id, {
      node,
      instanceIndex: count,
      moduleId,
      variablePrefix,
    });
  });

  return instances;
}

function getInstanceVariableName(baseName: string, prefix: string): string {
  if (!prefix) return baseName;
  return `${baseName}${prefix}`;
}

function getParameterValue(
  paramId: string,
  nodeData: OpforNodeData
): string | number | undefined {
  if (nodeData.parameters && paramId in nodeData.parameters) {
    const value = nodeData.parameters[paramId];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  const paramDef = nodeData.definition.parameters?.find(p => p.id === paramId);
  if (paramDef?.default !== undefined) {
    return paramDef.default;
  }

  return undefined;
}

function getGlobalSetting(key: string, globalSettings: OpforGlobalSettings): string {
  // ARTIFACT_DIR uses the same slug logic as generateVariables
  const campaignSlug = (globalSettings.executionPlanName || 'campaign')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const mapping: Record<string, string | undefined> = {
    'CS_IP':        globalSettings.c2Server,
    'CS_USER':      globalSettings.csUser,
    'CS_PASS':      globalSettings.csPass,
    'CS_DIR':       globalSettings.csDir,
    'CS_PORT':      globalSettings.csPort,
    'WORKDIR':      globalSettings.workdir,
    'ARTIFACT_DIR': globalSettings.artifactDir ?? `artifact/${campaignSlug}`,
    'DEBUG_MODE':   globalSettings.debugMode   ?? '${False}',
    'SUDO_NEEDED':  globalSettings.sudoNeeded  ?? '${False}',
  };
  return mapping[key] ?? '';
}

function resolveVariableReference(
  varRef: string,
  currentNodeId: string,
  connectionContext: ConnectionContext,
  nodeInstances: Map<string, NodeInstance>,
  nodeMap: Map<string, Node>
): string {
  if (!varRef.startsWith('${') || !varRef.endsWith('}')) {
    return varRef;
  }

  const baseVarName = varRef.slice(2, -1);
  const varCategory = baseVarName.split('_')[0];

  const inputSources = connectionContext.inputSources.get(currentNodeId);
  if (!inputSources) return varRef;

  for (const [_inputId, sourceNodeId] of inputSources) {
    const sourceNode = nodeMap.get(sourceNodeId);
    if (!sourceNode) continue;

    const sourceData = sourceNode.data as OpforNodeData;
    const sourceRobotConfig = sourceData.definition.robotFramework as RobotFrameworkConfig | undefined;
    if (!sourceRobotConfig?.variables) continue;

    const matchingVar = sourceRobotConfig.variables.find(v => {
      const vCategory = v.name.split('_')[0];
      return vCategory === varCategory;
    });

    if (matchingVar) {
      const sourceInstance = nodeInstances.get(sourceNodeId);
      if (sourceInstance) {
        const instanceVarName = getInstanceVariableName(baseVarName, sourceInstance.variablePrefix);
        return `\${${instanceVarName}}`;
      }
    }
  }

  return varRef;
}

function substituteStatementVariables(
  statement: string,
  instance: NodeInstance,
  robotConfig: RobotFrameworkConfig,
  sessionContext: SessionContext
): string {
  let result = statement;

  // Build merged variable list: robotConfig.variables + MODULE_SUITE_VARS fallback
  // This ensures log strings work even for stale canvas nodes with empty variables arrays.
  const moduleId = (instance.node.data as OpforNodeData).definition;
  const moduleKey = (moduleId as any)._key || (moduleId as any).id || '';
  const staticVarDefs = MODULE_SUITE_VARS[moduleKey] ?? [];
  const ownVarNames = new Set((robotConfig.variables ?? []).map(v => v.name));
  const allVarDefs = [
    ...(robotConfig.variables ?? []),
    ...staticVarDefs.filter(sv => !ownVarNames.has(sv.name)),
  ];

  allVarDefs.forEach(varDef => {
    const baseVar = `\${${varDef.name}}`;
    const instanceVar = `\${${getInstanceVariableName(varDef.name, instance.variablePrefix)}}`;
    result = result.split(baseVar).join(instanceVar);
  });

  allVarDefs.forEach(varDef => {
    if (varDef.fromParam) {
      const paramVar = `\${${varDef.fromParam}}`;
      const instanceVar = `\${${getInstanceVariableName(varDef.name, instance.variablePrefix)}}`;
      result = result.split(paramVar).join(instanceVar);
    }
  });

  // Legacy variable name remaps — stale canvas nodes may have old names baked
  // into preKeywordLog strings. Remap them to their current canonical names.
  const LEGACY_VAR_RENAMES: Record<string, string> = {
    'PERSISTENCE_KEY': 'RUN_KEY',   // cs-persistence-registry rename
    'PAYLOAD_NAME':    'HTTP_PAYLOAD_NAME',
    'LISTENER_NAME':   'HTTP_LISTENER',
  };
  Object.entries(LEGACY_VAR_RENAMES).forEach(([oldName, newName]) => {
    result = result.split(`\${${oldName}}`).join(`\${${newName}}`);
  });

  if (robotConfig.captureOutput) {
    const baseOutputVar = `\${${robotConfig.captureOutput}}`;
    const instanceOutputVar = `\${${getInstanceVariableName(robotConfig.captureOutput, instance.variablePrefix)}}`;
    result = result.split(baseOutputVar).join(instanceOutputVar);
  }

  if (sessionContext.currentSessionVariable) {
    const sessionPatterns = ['CURRENT_SESSION', 'SESSION', 'session'];
    sessionPatterns.forEach(pattern => {
      const baseSessionVar = `\${${pattern}}`;
      const actualSessionVar = `\${${sessionContext.currentSessionVariable}}`;
      result = result.split(baseSessionVar).join(actualSessionVar);
    });
  }

  return result;
}

/**
 * Build the Suite Setup or Suite Teardown line + continuation args.
 * Named args are emitted as:  ...    argName=${VALUE}
 */
function buildSuiteLifecycleLine(
  prefix: 'Suite Setup' | 'Suite Teardown',
  keyword: string,
  keywordArgs: KeywordArg[],
  globalSettings: OpforGlobalSettings
): string[] {
  const lines: string[] = [];

  if (keywordArgs.length === 0) {
    lines.push(`${prefix.padEnd(20)}${keyword}`);
    return lines;
  }

  // First continuation arg goes on the same logical line
  lines.push(`${prefix.padEnd(20)}${keyword}`);

  keywordArgs
    .sort((a, b) => a.position - b.position)
    .forEach(arg => {
      let value = '';

      if (arg.globalSetting) {
        value = `\${${arg.globalSetting}}`;
      } else if (arg.staticValue) {
        value = arg.staticValue;
      } else if (arg.variableName) {
        value = `\${${arg.variableName}}`;
      }

      if (!value) return;

      if (arg.named && arg.argName) {
        lines.push(`...                     ${arg.argName}=${value}`);
      } else {
        lines.push(`...                     ${value}`);
      }
    });

  return lines;
}

// ── Settings ──────────────────────────────────────────────────────────────────

function generateSettings(
  allNodes: Node[],
  globalSettings: OpforGlobalSettings
): { content: string; warnings: string[] } {
  const warnings: string[] = [];
  const libraries = new Set<string>();
  const resources = new Set<string>();   // kept for future use, currently empty
 
  let suiteSetupNode: Node | null = null;
  let suiteTeardownNode: Node | null = null;
 
  allNodes.forEach(node => {
    const data = node.data as OpforNodeData;
    const robotConfig = data.definition.robotFramework as RobotFrameworkConfig | undefined;
 
    if (!robotConfig) {
      warnings.push(`Node "${data.definition.name}" missing robotFramework config`);
      return;
    }
 
    // ── Collect Library imports — three-tier resolution ───────────────────
    // Tier 1: robotFramework.libraries[] on the node def (set when payload was
    //         fetched fresh via getModulePayload at drop time).
    // Tier 2: requirements.libraries[] on the node def, minus hunt_1.resource
    //         (also from the payload JSON, same condition as tier 1).
    // Tier 3: MODULE_LIBRARIES static map keyed by _key — always available,
    //         covers nodes placed before updated JSONs were deployed (stale
    //         canvas definitions baked into localStorage autosave).
    const moduleKey: string = (data.definition as any)._key || data.definition.id || '';

    const rfLibs: string[] = robotConfig.libraries ?? [];
    const reqLibs: string[] = (
      (data.definition.requirements as any)?.libraries ?? []
    ).filter((l: string) => l !== 'hunt_1.resource');
    const staticLibs: string[] = MODULE_LIBRARIES[moduleKey] ?? [];

    const nodeLibraries =
      rfLibs.length  > 0 ? rfLibs  :
      reqLibs.length > 0 ? reqLibs :
      staticLibs;

    nodeLibraries.forEach(lib => libraries.add(lib));

    // Resource imports — kept for extensibility, hunt_1.resource excluded.
    if (robotConfig.resources) {
      robotConfig.resources
        .filter(r => r !== 'hunt_1.resource')
        .forEach(r => resources.add(r));
    }
 
    if (robotConfig.isSuiteSetup)    suiteSetupNode    = node;
    if (robotConfig.isSuiteTeardown) suiteTeardownNode = node;
  });
 
  const lines: string[] = [
    '*** Settings ***',
    `Documentation       ${globalSettings.executionPlanName || 'Generated Workflow'}`,
    '',
  ];
 
  // Libraries — sorted for deterministic output
  Array.from(libraries).sort().forEach(lib => {
    lines.push(`Library             ${lib}`);
  });
 
  // Resources (empty in standard CS campaigns, but respected if present)
  if (resources.size > 0) {
    if (libraries.size > 0) lines.push('');
    Array.from(resources).sort().forEach(res => {
      lines.push(`Resource            ${res}`);
    });
  }
 
  // Suite Setup
  if (suiteSetupNode) {
    const data = (suiteSetupNode as Node).data as OpforNodeData;
    const rc = data.definition.robotFramework as RobotFrameworkConfig;
    lines.push('');
    const setupLines = buildSuiteLifecycleLine(
      'Suite Setup',
      rc.keyword,
      rc.keywordArgs ?? [],
      globalSettings
    );
    lines.push(...setupLines);
  }
 
  // Suite Teardown
  if (suiteTeardownNode) {
    const data = (suiteTeardownNode as Node).data as OpforNodeData;
    const rc = data.definition.robotFramework as RobotFrameworkConfig;
    lines.push('');
    const teardownLines = buildSuiteLifecycleLine(
      'Suite Teardown',
      rc.keyword,
      rc.keywordArgs ?? [],
      globalSettings
    );
    lines.push(...teardownLines);
  }
 
  return { content: lines.join('\n'), warnings };
}

// ── Variables ─────────────────────────────────────────────────────────────────

function generateVariables(
  allNodes: Node[],
  nodeInstances: Map<string, NodeInstance>,
  globalSettings: OpforGlobalSettings
): string {
  const lines: string[] = ['*** Variables ***'];

  // ── C2 Infrastructure Variables ───────────────────────────────────────────
  // Only true campaign-level config lives here.
  // Target IPs, payload names, beacon paths are declared by their respective
  // nodes as suite-scoped variables in the per-node blocks below.
  const c2Vars: Array<{ name: string; value: string }> = [];

  if (globalSettings.workdir)    c2Vars.push({ name: 'WORKDIR',  value: globalSettings.workdir });
  if (globalSettings.c2Server)   c2Vars.push({ name: 'CS_IP',    value: globalSettings.c2Server });
  if (globalSettings.csUser)     c2Vars.push({ name: 'CS_USER',  value: globalSettings.csUser });
  c2Vars.push({ name: 'CS_PASS', value: globalSettings.csPass || '' });
  if (globalSettings.csDir)      c2Vars.push({ name: 'CS_DIR',   value: globalSettings.csDir });
  if (globalSettings.csPort)     c2Vars.push({ name: 'CS_PORT',  value: globalSettings.csPort });

  // ARTIFACT_DIR — defaults to artifact/<campaign-name> so each campaign gets
  // its own folder. Slugify the name to make it filesystem-safe.
  const campaignSlug = (globalSettings.executionPlanName || 'campaign')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const artifactDir = globalSettings.artifactDir ?? `artifact/${campaignSlug}`;
  c2Vars.push({ name: 'ARTIFACT_DIR', value: artifactDir });
  c2Vars.push({ name: 'DEBUG_MODE',   value: globalSettings.debugMode  ?? '${False}' });
  c2Vars.push({ name: 'SUDO_NEEDED',  value: globalSettings.sudoNeeded ?? '${False}' });

  // LOCAL_INITIAL_BEACON — derived from WORKDIR + the payload name produced by
  // cs-generate-payload. Defaults to ${WORKDIR}update.exe if no payload node
  // is on canvas. When cs-generate-payload is present its HTTP_PAYLOAD_NAME
  // variable is declared in the per-node block below, but we still need this
  // global reference so cs-initial-access can use it before the payload keyword
  // runs in the test body.
  const payloadNode = allNodes.find(n =>
    ((n.data as OpforNodeData).definition as any)._key === 'cs-generate-payload' ||
    (n.data as OpforNodeData).definition.id === 'cs-generate-payload'
  );
  const payloadName = payloadNode
    ? ((payloadNode.data as OpforNodeData).parameters?.payloadName ?? 'update')
    : 'update';
  c2Vars.push({ name: 'LOCAL_INITIAL_BEACON', value: `\${WORKDIR}${payloadName}.exe` });

  if (c2Vars.length > 0) {
    lines.push('# C2 Server Configuration');
    c2Vars.forEach(v => {
      const paddedName = `\${${v.name}}`.padEnd(28);
      lines.push(`${paddedName}${v.value}`);
    });
  }

  // Per-node variable blocks (listener names, payload names, etc.)
  const nodeVariableBlocks: Array<{ label: string; vars: Array<{ name: string; value: string | number }> }> = [];

  allNodes.forEach(node => {
    const data = node.data as OpforNodeData;
    const robotConfig = data.definition.robotFramework as RobotFrameworkConfig | undefined;
    const instance = nodeInstances.get(node.id);

    if (!instance) return;

    const blockVars: Array<{ name: string; value: string | number }> = [];

    // Determine which variable definitions to use:
    //   1. Node's own robotConfig.variables (fresh drop with current payload JSON)
    //   2. MODULE_SUITE_VARS static fallback (stale canvas node)
    const moduleId = (data.definition as any)._key || data.definition.id || '';
    const ownVars: VariableDefinition[] = robotConfig?.variables ?? [];
    const staticVars: StaticVarDef[] = MODULE_SUITE_VARS[moduleId] ?? [];

    // Build a merged set: ownVars take priority; fill gaps from staticVars
    const ownVarNames = new Set(ownVars.map(v => v.name));
    const mergedVars: Array<{ name: string; fromParam?: string; default?: string; fromGlobalSetting?: string }> = [
      ...ownVars,
      ...staticVars.filter(sv => !ownVarNames.has(sv.name)),
    ];

    mergedVars.forEach(varDef => {
      // ownVars entries have a scope field; staticVars are always suite-scoped
      const scope = (varDef as VariableDefinition).scope ?? 'suite';
      if (scope === 'suite' || scope === 'global') {
        let value: string | number | undefined;

        if (varDef.fromParam) {
          // Try to read from node params first; fall back to static default
          // so stale canvas nodes (where params may be empty) still emit variables.
          // Reject Robot variable references (${...}) as param values — these are
          // template placeholders, not real values (e.g. targetIp = "${TARGET2}").
          const rawParamValue = getParameterValue(varDef.fromParam, data);
          const isRobotVarRef = typeof rawParamValue === 'string'
            && rawParamValue.startsWith('${') && rawParamValue.endsWith('}');
          value = (!isRobotVarRef ? rawParamValue : undefined) ?? varDef.default;
        } else if ((varDef as VariableDefinition).fromGlobalSetting) {
          value = getGlobalSetting((varDef as VariableDefinition).fromGlobalSetting!, globalSettings);
        } else {
          value = varDef.default;
        }

        if (value !== undefined && value !== '') {
          const instanceVarName = getInstanceVariableName(varDef.name, instance.variablePrefix);
          blockVars.push({ name: instanceVarName, value });
        }
      }
    });

    if (blockVars.length > 0) {
      const instanceLabel = instance.instanceIndex > 1
        ? `${data.definition.name} (Instance ${instance.instanceIndex})`
        : data.definition.name;

      nodeVariableBlocks.push({ label: instanceLabel, vars: blockVars });
    }
  });

  nodeVariableBlocks.forEach(block => {
    lines.push('');
    lines.push(`# ${block.label}`);
    block.vars.forEach(v => {
      const paddedName = `\${${v.name}}`.padEnd(28);
      lines.push(`${paddedName}${v.value}`);
    });
  });

  return lines.join('\n');
}

// ── Test Cases ────────────────────────────────────────────────────────────────

function generateTestCases(
  connectedNodes: Node[],
  nodeInstances: Map<string, NodeInstance>,
  connectionContext: ConnectionContext,
  nodeMap: Map<string, Node>,
  globalSettings: OpforGlobalSettings
): string {
  const lines: string[] = ['*** Test Cases ***'];

  const testCaseName = globalSettings.executionPlanName || 'Workflow Execution';
  lines.push(testCaseName);
  lines.push(`    [Documentation]    ${globalSettings.executionPlanName || 'Generated workflow'}`);

  if (connectedNodes.length === 0) {
    lines.push('    # No execution chain defined');
    lines.push('    # Connect nodes on canvas to build test sequence');
    lines.push('    Log    Workflow not yet configured');
    return lines.join('\n');
  }

  lines.push('');

  let teardownKeyword: string | null = null;

  const sessionContext: SessionContext = {
    currentSessionVariable: null,
    producerNodeId: null,
  };

  connectedNodes.forEach(node => {
    const data = node.data as OpforNodeData;
    const robotConfig = data.definition.robotFramework as RobotFrameworkConfig | undefined;
    const instance = nodeInstances.get(node.id);

    if (!robotConfig || !instance) return;

    // Suite setup/teardown nodes don't go in the test body
    if (robotConfig.isSuiteSetup || robotConfig.isSuiteTeardown) return;

    if (robotConfig.isTeardown) {
      teardownKeyword = robotConfig.keyword;
      return;
    }

    // Pre-keyword log
    if (robotConfig.preKeywordLog) {
      const logMsg = substituteStatementVariables(
        robotConfig.preKeywordLog, instance, robotConfig, sessionContext
      );
      lines.push(`    Log To Console    \\n${logMsg}`);
    }

    // Pre-keyword statements
    if (robotConfig.preKeywordStatements?.length) {
      robotConfig.preKeywordStatements.forEach(stmt => {
        const resolvedStmt = substituteStatementVariables(stmt, instance, robotConfig, sessionContext);
        lines.push(`    ${resolvedStmt}`);
      });
    }

    // Keyword call line
    const hasOutput = robotConfig.captureOutput;
    const outputVar = hasOutput
      ? getInstanceVariableName(robotConfig.captureOutput!, instance.variablePrefix)
      : null;
    const varPrefix = robotConfig.captureOutputAsList ? '@' : '$';

    const keywordLine = outputVar
      ? `    ${varPrefix}{${outputVar}}=    ${robotConfig.keyword}`
      : `    ${robotConfig.keyword}`;

    lines.push(keywordLine);

    // Keyword arguments
    if (robotConfig.keywordArgs?.length) {
      robotConfig.keywordArgs
        .sort((a, b) => a.position - b.position)
        .forEach(arg => {
          let argValue = '';

          if (arg.staticValue) {
            argValue = arg.staticValue;
          } else if (arg.globalSetting) {
            argValue = `\${${arg.globalSetting}}`;
          } else if (arg.sessionVariable) {
            argValue = sessionContext.currentSessionVariable
              ? `\${${sessionContext.currentSessionVariable}}`
              : `\${${arg.sessionVariable}}`;
          } else if (arg.fromInput) {
            const inputSources = connectionContext.inputSources.get(node.id);
            if (inputSources) {
              const sourceNodeId = inputSources.get(arg.fromInput);
              if (sourceNodeId) {
                const sourceInstance = nodeInstances.get(sourceNodeId);
                const sourceNode = nodeMap.get(sourceNodeId);
                if (sourceInstance && sourceNode) {
                  const sourceData = sourceNode.data as OpforNodeData;
                  const sourceRobotConfig = sourceData.definition.robotFramework as RobotFrameworkConfig | undefined;
                  if (sourceRobotConfig?.captureOutput) {
                    const sourceOutputVar = getInstanceVariableName(
                      sourceRobotConfig.captureOutput,
                      sourceInstance.variablePrefix
                    );
                    argValue = `\${${sourceOutputVar}}`;
                  } else if (sourceRobotConfig?.sessionVariable) {
                    argValue = `\${${sourceRobotConfig.sessionVariable}}`;
                  }
                }
              }
            }
            if (!argValue && arg.variableName) {
              argValue = `\${${arg.variableName}}`;
            }
          } else if (arg.param) {
            if (arg.variableRef && arg.variableName) {
              const instanceVarName = getInstanceVariableName(arg.variableName, instance.variablePrefix);
              argValue = `\${${instanceVarName}}`;
            } else {
              const value = getParameterValue(arg.param, data);
              let strValue = String(value ?? '');
              if (strValue.startsWith('${') && strValue.endsWith('}')) {
                strValue = resolveVariableReference(
                  strValue, node.id, connectionContext, nodeInstances, nodeMap
                );
              }
              argValue = strValue;
            }
          } else if (arg.variableName) {
            // Bare variableName with no param — reference a variable by name directly
            const instanceVarName = getInstanceVariableName(arg.variableName, instance.variablePrefix);
            argValue = `\${${instanceVarName}}`;
          }

          if (argValue) {
            lines.push(`    ...    ${argValue}`);
          }
        });
    }

    // Post-keyword statements
    if (robotConfig.postKeywordStatements?.length) {
      robotConfig.postKeywordStatements.forEach(stmt => {
        const resolvedStmt = substituteStatementVariables(stmt, instance, robotConfig, sessionContext);
        lines.push(`    ${resolvedStmt}`);
      });
    }

    // Update session context
    if (robotConfig.sessionVariable) {
      sessionContext.currentSessionVariable = robotConfig.sessionVariable;
      sessionContext.producerNodeId = node.id;
    }

    // Post-keyword log
    if (robotConfig.postKeywordLog) {
      const logMsg = substituteStatementVariables(
        robotConfig.postKeywordLog, instance, robotConfig, sessionContext
      );
      lines.push(`    Log To Console    \\n${logMsg}`);
    }

    lines.push('');
  });

  if (teardownKeyword) {
    lines.push(`    [Teardown]    ${teardownKeyword}`);
  }

  return lines.join('\n');
}

function generateKeywords(_nodes: Node[]): string {
  return '*** Keywords ***\n';
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateRobotScript(
  nodes: Node[],
  edges: Edge[],
  globalSettings: OpforGlobalSettings
): RobotScript {
  const warnings: string[] = [];
  const missingDeps: string[] = [];

  const validNodes = nodes.filter(n => {
    const data = n.data as OpforNodeData;
    return data?.definition;
  });

  if (validNodes.length === 0) {
    return {
      settings: '*** Settings ***\nDocumentation    Empty workflow\n',
      variables: '*** Variables ***\n# No variables defined\n',
      testCases: '*** Test Cases ***\nWorkflow Execution\n    # Add nodes to canvas\n    Log    No nodes configured\n',
      keywords: '*** Keywords ***\n',
      full: '# Empty workflow - add nodes to generate script',
      warnings: ['No valid nodes found in workflow'],
      missingDeps: [],
      meta: { totalNodes: 0, connectedNodes: 0, stagedNodes: 0, hasExecutionChain: false },
    };
  }

  const nodeMap = new Map(validNodes.map(n => [n.id, n]));
  const nodeInstances = buildNodeInstances(validNodes);
  const connectionContext = buildConnectionContext(edges);

  // Modules that are legitimately reused across the chain — suppress duplicate warnings.
  const MULTI_INSTANCE_OK = new Set([
    'cs-session-sleep', 'cs-get-processes', 'cs-query-registry',
    'cs-list-directory', 'cs-get-arp', 'cs-getuid', 'cs-get-pwd',
    'cs-network-enumerate', 'cs-upload-file', 'cs-delete-file',
    'cs-create-listener', 'cs-generate-payload',
  ]);

  // Warn on duplicate module instances (skip known-safe reuse)
  const instanceCounts = new Map<string, number>();
  nodeInstances.forEach(inst => {
    instanceCounts.set(inst.moduleId, Math.max(instanceCounts.get(inst.moduleId) || 0, inst.instanceIndex));
  });
  instanceCounts.forEach((count, moduleId) => {
    if (count > 1 && !MULTI_INSTANCE_OK.has(moduleId)) {
      warnings.push(`Multiple instances of "${moduleId}": ${count} (variables suffixed _2, _3, etc.)`);
    }
  });

  const connectedNodeIds = getConnectedNodes(validNodes, edges);
  const connectedNodes = validNodes.filter(n => connectedNodeIds.has(n.id));
  const sortedConnectedNodes = connectedNodes.length > 0
    ? topologicalSort(connectedNodes, edges)
    : [];

  const { content: settings, warnings: settingsWarnings } = generateSettings(validNodes, globalSettings);
  warnings.push(...settingsWarnings);

  const variables = generateVariables(validNodes, nodeInstances, globalSettings);
  const testCases = generateTestCases(
    sortedConnectedNodes,
    nodeInstances,
    connectionContext,
    nodeMap,
    globalSettings
  );
  const keywords = generateKeywords(validNodes);

  validNodes.forEach(node => {
    const data = node.data as OpforNodeData;
    if (!data.definition.robotFramework) {
      missingDeps.push(`${data.definition.name}: Missing robotFramework configuration`);
    }
  });

  const stagedCount = validNodes.length - connectedNodes.length;
  if (stagedCount > 0) {
    warnings.push(`${stagedCount} node(s) staged but not connected to execution chain`);
  }

  const full = [settings, '', '', variables, '', '', testCases].join('\n');

  return {
    settings,
    variables,
    testCases,
    keywords,
    full,
    warnings,
    missingDeps,
    meta: {
      totalNodes: validNodes.length,
      connectedNodes: connectedNodes.length,
      stagedNodes: stagedCount,
      hasExecutionChain: connectedNodes.length > 0,
    },
  };
}

export function downloadRobotScript(script: RobotScript, filename?: string): void {
  const blob = new Blob([script.full], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'workflow.robot';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}