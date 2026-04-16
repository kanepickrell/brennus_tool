// src/services/robotScriptGenerator.ts
// Generates Robot Framework scripts from Operator workflow canvas
// NO HARDCODED VALUES - all config comes from globalSettings or node parameters
// IMPORTANT: Only connected/chained nodes appear in Test Cases
// IMPORTANT: Each node instance gets unique variable names to avoid collisions
// IMPORTANT: Variable references auto-resolve based on canvas connections

import { Node, Edge } from '@xyflow/react';
import { OpforNodeData, OpforGlobalSettings } from '@/types/opfor';
import {
  resolveVariableReference,
  buildConnectionContext,
  type ConnectionContext,
} from './variableResolution';
import {
  targetFieldVariableName,
} from '../data/rangeTargets';
import type { RangeTargetData } from '../types/opforRangeTarget';

// ── Static library map ────────────────────────────────────────────────────────
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
  'ph-start-http-server': ['phishing/PhishingLibrary.py', 'phishing/HTTPLibrary.py'],
  'ph-stop-http-server':  ['phishing/HTTPLibrary.py'],
  'ph-create-email':      ['phishing/PhishingLibrary.py'],
  'ph-send-email':        ['phishing/PhishingLibrary.py'],
  'ph-launch-attack':     ['phishing/PhishingLibrary.py', 'phishing/HTTPLibrary.py'],
};

interface StaticLibraryArg {
  paramName: string;
  globalSetting: string;
  position: number;
}

const MODULE_LIBRARY_INIT_ARGS: Record<string, StaticLibraryArg[]> = {
  'cs-start-c2': [
    { paramName: 'user',          globalSetting: 'CS_USER',     position: 1 },
    { paramName: 'cs_password',   globalSetting: 'CS_PASS',     position: 2 },
    { paramName: 'cs_dir',        globalSetting: 'CS_DIR',      position: 3 },
    { paramName: 'port',          globalSetting: 'CS_PORT',     position: 4 },
    { paramName: 'debug',         globalSetting: 'DEBUG_MODE',  position: 5 },
  ],
};

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
    { name: 'APPDATA_PATH', fromParam: 'appdataPath', default: 'AppData\\Local\\Temp',                                                scope: 'suite' },
    { name: 'RUN_KEY',      fromParam: 'runKey',       default: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', scope: 'suite' },
  ],
  'cs-network-enumerate': [
    { name: 'SCAN_METHOD', fromParam: 'scanMethod', default: 'portscan', scope: 'suite' },
    { name: 'ARCH',        fromParam: 'arch',        default: 'x64',     scope: 'suite' },
  ],
  'cs-stage-data': [
    { name: 'SOURCE_PATH', fromParam: 'sourcePath', default: 'C:\\Users\\*\\Documents',        scope: 'suite' },
    { name: 'DEST_PATH',   fromParam: 'destPath',   default: 'C:\\Windows\\Temp\\staged.zip', scope: 'suite' },
  ],
};

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
  named?: boolean;
  argName?: string;
}

interface LibraryArg {
  paramName: string;
  globalSetting?: string;
  staticValue?: string;
  position: number;
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
  libraryArgs?: LibraryArg[];
  variables?: VariableDefinition[];
  preKeywordLog?: string;
  postKeywordLog?: string;
  captureOutput?: string;
  isTeardown?: boolean;
  isSuiteSetup?: boolean;
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

function substituteStatementVariables(
  statement: string,
  instance: NodeInstance,
  robotConfig: RobotFrameworkConfig,
  sessionContext: SessionContext
): string {
  let result = statement;

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

  const LEGACY_VAR_RENAMES: Record<string, string> = {
    'PERSISTENCE_KEY': 'RUN_KEY',
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
  const resources = new Set<string>();

  let suiteSetupNode: Node | null = null;
  let suiteTeardownNode: Node | null = null;

  const libraryInitArgs = new Map<string, Array<{ paramName: string; value: string }>>();

  allNodes.forEach(node => {
    const data = node.data as OpforNodeData;
    const robotConfig = data.definition?.robotFramework as RobotFrameworkConfig | undefined;

    if (!robotConfig) {
      // Range target nodes don't have robotFramework config, skip warning
      if (node.type !== 'rangeTargetNode') {
        warnings.push(`Node "${data.definition?.name || node.id}" missing robotFramework config`);
      }
      return;
    }

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

    if (robotConfig.resources) {
      robotConfig.resources
        .filter(r => r !== 'hunt_1.resource')
        .forEach(r => resources.add(r));
    }

    const jsonLibraryArgs: LibraryArg[] = robotConfig.libraryArgs ?? [];
    const staticLibraryArgs: StaticLibraryArg[] = MODULE_LIBRARY_INIT_ARGS[moduleKey] ?? [];

    const resolvedLibraryArgs =
      jsonLibraryArgs.length > 0 ? jsonLibraryArgs : staticLibraryArgs;

    if (resolvedLibraryArgs.length > 0) {
      nodeLibraries.forEach(lib => {
        if (!libraryInitArgs.has(lib)) {
          const args = [...resolvedLibraryArgs]
            .sort((a, b) => a.position - b.position)
            .map(arg => {
              let value = '';
              if (arg.globalSetting) {
                value = `\${${arg.globalSetting}}`;
              } else if ((arg as LibraryArg).staticValue) {
                value = (arg as LibraryArg).staticValue!;
              }
              return { paramName: arg.paramName, value };
            })
            .filter(a => a.value !== '');
          if (args.length > 0) {
            libraryInitArgs.set(lib, args);
          }
        }
      });
    }

    if (robotConfig.isSuiteSetup)    suiteSetupNode    = node;
    if (robotConfig.isSuiteTeardown) suiteTeardownNode = node;
  });

  const lines: string[] = [
    '*** Settings ***',
    `Documentation       ${globalSettings.executionPlanName || 'Generated Workflow'}`,
    '',
  ];

  Array.from(libraries).sort().forEach(lib => {
    const initArgs = libraryInitArgs.get(lib);
    if (initArgs && initArgs.length > 0) {
      lines.push(`Library             ${lib}`);
      initArgs.forEach(arg => {
        lines.push(`...                 ${arg.paramName}=\${${arg.value.slice(2, -1)}}`);
      });
    } else {
      lines.push(`Library             ${lib}`);
    }
  });

  if (resources.size > 0) {
    if (libraries.size > 0) lines.push('');
    Array.from(resources).sort().forEach(res => {
      lines.push(`Resource            ${res}`);
    });
  }

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

  // Emit range target variables as suite-level Robot variables.
  const targetNodes = allNodes.filter(
    (n): n is Node & { data: RangeTargetData } => n.type === 'rangeTargetNode',
  );

  if (targetNodes.length > 0) {
    lines.push('');
    lines.push('# ─── Range Design Targets ───');
    for (const t of targetNodes) {
      const td = t.data;
      if (!td.name) continue;
      lines.push(`# ${td.icon}  ${td.name}  (${td.kind})`);

      for (const field of Object.values(td.fields)) {
        if (!field.value) continue;
        // Sensitive fields in env mode are NOT emitted — the reference uses %{}
        if (field.sensitive && field.emitMode === 'env') continue;

        const varName = targetFieldVariableName(td.name, field.id);
        lines.push(`\${${varName}}\t${field.value}`);
      }
      lines.push('');
    }
  }

  const c2Vars: Array<{ name: string; value: string }> = [];

  if (globalSettings.workdir)    c2Vars.push({ name: 'WORKDIR',  value: globalSettings.workdir });
  if (globalSettings.c2Server)   c2Vars.push({ name: 'CS_IP',    value: globalSettings.c2Server });
  if (globalSettings.csUser)     c2Vars.push({ name: 'CS_USER',  value: globalSettings.csUser });
  c2Vars.push({ name: 'CS_PASS', value: globalSettings.csPass || '' });
  if (globalSettings.csDir)      c2Vars.push({ name: 'CS_DIR',   value: globalSettings.csDir });
  if (globalSettings.csPort)     c2Vars.push({ name: 'CS_PORT',  value: globalSettings.csPort });

  const campaignSlug = (globalSettings.executionPlanName || 'campaign')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const artifactDir = globalSettings.artifactDir ?? `artifact/${campaignSlug}`;
  c2Vars.push({ name: 'ARTIFACT_DIR', value: artifactDir });
  c2Vars.push({ name: 'DEBUG_MODE',   value: globalSettings.debugMode  ?? '${False}' });
  c2Vars.push({ name: 'SUDO_NEEDED',  value: globalSettings.sudoNeeded ?? '${False}' });

  const payloadNode = allNodes.find(n =>
    ((n.data as OpforNodeData).definition as any)?._key === 'cs-generate-payload' ||
    (n.data as OpforNodeData).definition?.id === 'cs-generate-payload'
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

  const nodeVariableBlocks: Array<{ label: string; vars: Array<{ name: string; value: string | number }> }> = [];

  allNodes.forEach(node => {
    const data = node.data as OpforNodeData;
    const robotConfig = data.definition?.robotFramework as RobotFrameworkConfig | undefined;
    const instance = nodeInstances.get(node.id);

    if (!instance || !data.definition) return;

    const blockVars: Array<{ name: string; value: string | number }> = [];

    const moduleId = (data.definition as any)._key || data.definition.id || '';
    const ownVars: VariableDefinition[] = robotConfig?.variables ?? [];
    const staticVars: StaticVarDef[] = MODULE_SUITE_VARS[moduleId] ?? [];

    const ownVarNames = new Set(ownVars.map(v => v.name));
    const mergedVars: Array<{ name: string; fromParam?: string; default?: string; fromGlobalSetting?: string }> = [
      ...ownVars,
      ...staticVars.filter(sv => !ownVarNames.has(sv.name)),
    ];

    mergedVars.forEach(varDef => {
      const scope = (varDef as VariableDefinition).scope ?? 'suite';
      if (scope === 'suite' || scope === 'global') {
        let value: string | number | undefined;

        if (varDef.fromParam) {
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
  allNodes: Node[],
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

    if (robotConfig.isSuiteSetup || robotConfig.isSuiteTeardown) return;

    if (robotConfig.isTeardown) {
      teardownKeyword = robotConfig.keyword;
      return;
    }

    if (robotConfig.preKeywordLog) {
      const logMsg = substituteStatementVariables(
        robotConfig.preKeywordLog, instance, robotConfig, sessionContext
      );
      lines.push(`    Log To Console    \\n${logMsg}`);
    }

    if (robotConfig.preKeywordStatements?.length) {
      robotConfig.preKeywordStatements.forEach(stmt => {
        const resolvedStmt = substituteStatementVariables(stmt, instance, robotConfig, sessionContext);
        lines.push(`    ${resolvedStmt}`);
      });
    }

    const hasOutput = robotConfig.captureOutput;
    const outputVar = hasOutput
      ? getInstanceVariableName(robotConfig.captureOutput!, instance.variablePrefix)
      : null;
    const varPrefix = robotConfig.captureOutputAsList ? '@' : '$';

    const keywordLine = outputVar
      ? `    ${varPrefix}{${outputVar}}=    ${robotConfig.keyword}`
      : `    ${robotConfig.keyword}`;

    lines.push(keywordLine);

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
              const strValue = String(value ?? '');
              const result = resolveVariableReference(
                strValue,
                node.id,
                allNodes,
                connectionContext
              );
              argValue = result?.resolvedReference ?? strValue;
            }
          } else if (arg.variableName) {
            const instanceVarName = getInstanceVariableName(arg.variableName, instance.variablePrefix);
            argValue = `\${${instanceVarName}}`;
          }

          if (argValue) {
            lines.push(`    ...    ${argValue}`);
          }
        });
    }

    if (robotConfig.postKeywordStatements?.length) {
      robotConfig.postKeywordStatements.forEach(stmt => {
        const resolvedStmt = substituteStatementVariables(stmt, instance, robotConfig, sessionContext);
        lines.push(`    ${resolvedStmt}`);
      });
    }

    if (robotConfig.sessionVariable) {
      sessionContext.currentSessionVariable = robotConfig.sessionVariable;
      sessionContext.producerNodeId = node.id;
    }

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
    // Opfor nodes need definition, Range target nodes are valid by type
    if (n.type === 'rangeTargetNode') return true;
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

  const MULTI_INSTANCE_OK = new Set([
    'cs-session-sleep', 'cs-get-processes', 'cs-query-registry',
    'cs-list-directory', 'cs-get-arp', 'cs-getuid', 'cs-get-pwd',
    'cs-network-enumerate', 'cs-upload-file', 'cs-delete-file',
    'cs-create-listener', 'cs-generate-payload',
  ]);

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
  const connectedNodes = validNodes.filter(n => connectedNodeIds.has(n.id) && n.type !== 'rangeTargetNode');
  const sortedConnectedNodes = connectedNodes.length > 0
    ? topologicalSort(connectedNodes, edges)
    : [];

  const { content: settings, warnings: settingsWarnings } = generateSettings(validNodes, globalSettings);
  warnings.push(...settingsWarnings);

  const variables = generateVariables(validNodes, nodeInstances, globalSettings);
  const testCases = generateTestCases(
    sortedConnectedNodes,
    validNodes,
    nodeInstances,
    connectionContext,
    nodeMap,
    globalSettings
  );
  const keywords = generateKeywords(validNodes);

  validNodes.forEach(node => {
    if (node.type === 'rangeTargetNode') return;
    const data = node.data as OpforNodeData;
    if (!data.definition.robotFramework) {
      missingDeps.push(`${data.definition.name}: Missing robotFramework configuration`);
    }
  });

  const stagedCount = validNodes.filter(n => n.type !== 'rangeTargetNode').length - connectedNodes.length;
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