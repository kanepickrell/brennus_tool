// src/services/robotScriptGenerator.ts
// Generates Robot Framework scripts from Operator workflow canvas
// NO HARDCODED VALUES - all config comes from globalSettings or node parameters
// IMPORTANT: Only connected/chained nodes appear in Test Cases
// IMPORTANT: Each node instance gets unique variable names to avoid collisions
// IMPORTANT: Variable references auto-resolve based on canvas connections

import { Node, Edge } from '@xyflow/react';
import { OpforNodeData, OpforGlobalSettings } from '@/types/opfor';

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
  /** Metadata about the generation */
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
  // NEW: Reference a session variable directly
  sessionVariable?: string;
  // NEW: Reference an input connection
  fromInput?: string;
}

interface VariableDefinition {
  name: string;
  fromParam?: string;
  fromGlobalSetting?: string;
  fromInput?: string;  // NEW: Get value from connected input
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
  // NEW FIELDS
  preKeywordStatements?: string[];    // Statements to execute before keyword
  postKeywordStatements?: string[];   // Statements to execute after keyword
  captureOutputAsList?: boolean;      // Use @{} instead of ${}
  sessionVariable?: string;           // Session variable this node produces/uses
}

/**
 * Instance tracking for unique variable naming
 */
interface NodeInstance {
  node: Node;
  instanceIndex: number;
  moduleId: string;
  variablePrefix: string;
}

/**
 * Connection context - maps node inputs to their source nodes
 */
interface ConnectionContext {
  /** Map of nodeId -> { inputId -> sourceNodeId } */
  inputSources: Map<string, Map<string, string>>;
  /** Map of nodeId -> { outputId -> targetNodeIds[] } */
  outputTargets: Map<string, Map<string, string[]>>;
}

/**
 * Session tracking - tracks which node produces the current session
 */
interface SessionContext {
  /** Current session variable name */
  currentSessionVariable: string | null;
  /** Node ID that produced the current session */
  producerNodeId: string | null;
}

/**
 * Find all nodes that are part of a connected chain
 */
function getConnectedNodes(nodes: Node[], edges: Edge[]): Set<string> {
  const connectedIds = new Set<string>();
  edges.forEach(edge => {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  });
  return connectedIds;
}

/**
 * Build connection context from edges
 * This tells us which node's output connects to which node's input
 */
function buildConnectionContext(edges: Edge[]): ConnectionContext {
  const inputSources = new Map<string, Map<string, string>>();
  const outputTargets = new Map<string, Map<string, string[]>>();

  edges.forEach(edge => {
    // Track input sources: target node's input <- source node
    if (!inputSources.has(edge.target)) {
      inputSources.set(edge.target, new Map());
    }
    const targetInputHandle = edge.targetHandle || 'default';
    inputSources.get(edge.target)!.set(targetInputHandle, edge.source);

    // Track output targets: source node's output -> target nodes
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

/**
 * Topologically sort nodes based on edge connections
 */
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

/**
 * Build instance tracking for all nodes
 */
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

/**
 * Get the instance-specific variable name
 */
function getInstanceVariableName(baseName: string, prefix: string): string {
  if (!prefix) return baseName;
  return `${baseName}${prefix}`;
}

/**
 * Get parameter value with fallback
 */
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

/**
 * Get global setting value
 */
function getGlobalSetting(key: string, globalSettings: OpforGlobalSettings): string {
  const mapping: Record<string, string | undefined> = {
    'CS_IP': globalSettings.c2Server,
    'CS_USER': globalSettings.csUser,
    'CS_PASS': globalSettings.csPass,
    'CS_DIR': globalSettings.csDir,
    'CS_PORT': globalSettings.csPort,
    'TARGET_IP': globalSettings.targetIp,
    'TARGET_USER': globalSettings.targetUser,
    'TARGET_PASS': globalSettings.targetPass,
    'TARGET_DOMAIN': globalSettings.targetDomain,
  };
  return mapping[key] || '';
}

/**
 * Resolve a variable reference based on canvas connections
 * 
 * If a parameter value is like ${LISTENER_NAME}, we check if this node
 * has an input connected to a node that produces LISTENER_NAME variables.
 * If so, we use that source node's instance-specific variable.
 */
function resolveVariableReference(
  varRef: string,
  currentNodeId: string,
  connectionContext: ConnectionContext,
  nodeInstances: Map<string, NodeInstance>,
  nodeMap: Map<string, Node>
): string {
  // Check if it's a variable reference
  if (!varRef.startsWith('${') || !varRef.endsWith('}')) {
    return varRef;
  }

  const baseVarName = varRef.slice(2, -1); // e.g., "LISTENER_NAME"
  
  // Get the category prefix (e.g., "LISTENER" from "LISTENER_NAME")
  const varCategory = baseVarName.split('_')[0];

  // Look at what's connected to this node's inputs
  const inputSources = connectionContext.inputSources.get(currentNodeId);
  if (!inputSources) {
    return varRef; // No inputs connected, return as-is
  }

  // Find a source node that produces variables in this category
  for (const [_inputId, sourceNodeId] of inputSources) {
    const sourceNode = nodeMap.get(sourceNodeId);
    if (!sourceNode) continue;

    const sourceData = sourceNode.data as OpforNodeData;
    const sourceRobotConfig = sourceData.definition.robotFramework as RobotFrameworkConfig | undefined;
    if (!sourceRobotConfig?.variables) continue;

    // Check if source node produces variables in this category
    const matchingVar = sourceRobotConfig.variables.find(v => {
      const vCategory = v.name.split('_')[0];
      return vCategory === varCategory;
    });

    if (matchingVar) {
      // Found the source! Use its instance-specific variable
      const sourceInstance = nodeInstances.get(sourceNodeId);
      if (sourceInstance) {
        const instanceVarName = getInstanceVariableName(baseVarName, sourceInstance.variablePrefix);
        return `\${${instanceVarName}}`;
      }
    }
  }

  // No matching connection found, return original
  return varRef;
}

/**
 * Substitute variables in a statement string
 * Handles both node-specific variables and session variables
 */
function substituteStatementVariables(
  statement: string,
  instance: NodeInstance,
  robotConfig: RobotFrameworkConfig,
  sessionContext: SessionContext
): string {
  let result = statement;

  // Substitute node-specific variables
  robotConfig.variables?.forEach(varDef => {
    const baseVar = `\${${varDef.name}}`;
    const instanceVar = `\${${getInstanceVariableName(varDef.name, instance.variablePrefix)}}`;
    result = result.split(baseVar).join(instanceVar);
  });

  // Substitute captured output variable
  if (robotConfig.captureOutput) {
    const baseOutputVar = `\${${robotConfig.captureOutput}}`;
    const instanceOutputVar = `\${${getInstanceVariableName(robotConfig.captureOutput, instance.variablePrefix)}}`;
    result = result.split(baseOutputVar).join(instanceOutputVar);
  }

  // Substitute session variable if present
  if (sessionContext.currentSessionVariable) {
    // Handle common session variable patterns
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
 * Generate the *** Settings *** section
 */
function generateSettings(
  allNodes: Node[],
  globalSettings: OpforGlobalSettings
): { content: string; warnings: string[] } {
  const warnings: string[] = [];
  const libraries = new Set<string>();
  const resources = new Set<string>();

  allNodes.forEach(node => {
    const data = node.data as OpforNodeData;
    const robotConfig = data.definition.robotFramework as RobotFrameworkConfig | undefined;

    if (robotConfig?.libraries) {
      robotConfig.libraries.forEach(lib => libraries.add(lib));
    }
    
    // NEW: Collect resources
    if (robotConfig?.resources) {
      robotConfig.resources.forEach(res => resources.add(res));
    }
    
    if (!robotConfig) {
      warnings.push(`Node "${data.definition.name}" missing robotFramework config`);
    }
  });

  const lines: string[] = [
    '*** Settings ***',
    `Documentation       ${globalSettings.executionPlanName || 'Generated Workflow'}`,
    ''
  ];

  // Add libraries
  Array.from(libraries).sort().forEach(lib => {
    lines.push(`Library             ${lib}`);
  });

  // NEW: Add resources
  if (resources.size > 0) {
    lines.push('');
    Array.from(resources).sort().forEach(res => {
      lines.push(`Resource            ${res}`);
    });
  }

  return { content: lines.join('\n'), warnings };
}

/**
 * Generate the *** Variables *** section
 */
function generateVariables(
  allNodes: Node[],
  nodeInstances: Map<string, NodeInstance>,
  globalSettings: OpforGlobalSettings
): string {
  const lines: string[] = ['*** Variables ***'];

  // C2 Configuration from global settings
  const c2Vars: Array<{ name: string; value: string }> = [];
  
  if (globalSettings.c2Server) c2Vars.push({ name: 'CS_IP', value: globalSettings.c2Server });
  if (globalSettings.csUser) c2Vars.push({ name: 'CS_USER', value: globalSettings.csUser });
  if (globalSettings.csPass) c2Vars.push({ name: 'CS_PASS', value: globalSettings.csPass });
  if (globalSettings.csDir) c2Vars.push({ name: 'CS_DIR', value: globalSettings.csDir });
  if (globalSettings.csPort) c2Vars.push({ name: 'CS_PORT', value: globalSettings.csPort });

  if (c2Vars.length > 0) {
    lines.push('# C2 Server Configuration');
    c2Vars.forEach(v => {
      const paddedName = `\${${v.name}}`.padEnd(24);
      lines.push(`${paddedName}${v.value}`);
    });
  }

  // Group variables by node instance
  const nodeVariableBlocks: Array<{ label: string; vars: Array<{ name: string; value: string | number }> }> = [];

  allNodes.forEach(node => {
    const data = node.data as OpforNodeData;
    const robotConfig = data.definition.robotFramework as RobotFrameworkConfig | undefined;
    const instance = nodeInstances.get(node.id);

    if (!robotConfig?.variables || !instance) return;

    const blockVars: Array<{ name: string; value: string | number }> = [];

    robotConfig.variables.forEach(varDef => {
      if (varDef.scope === 'suite' || varDef.scope === 'global') {
        let value: string | number | undefined;
        
        if (varDef.fromParam) {
          value = getParameterValue(varDef.fromParam, data);
        } else if (varDef.fromGlobalSetting) {
          value = getGlobalSetting(varDef.fromGlobalSetting, globalSettings);
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
      
      nodeVariableBlocks.push({
        label: instanceLabel,
        vars: blockVars,
      });
    }
  });

  nodeVariableBlocks.forEach(block => {
    lines.push('');
    lines.push(`# ${block.label}`);
    block.vars.forEach(v => {
      const paddedName = `\${${v.name}}`.padEnd(24);
      lines.push(`${paddedName}${v.value}`);
    });
  });

  return lines.join('\n');
}

/**
 * Generate the *** Test Cases *** section
 * Auto-resolves variable references based on canvas connections
 * NEW: Handles preKeywordStatements, postKeywordStatements, captureOutputAsList, sessionVariable
 */
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
  
  // NEW: Track session context across nodes
  const sessionContext: SessionContext = {
    currentSessionVariable: null,
    producerNodeId: null,
  };

  connectedNodes.forEach(node => {
    const data = node.data as OpforNodeData;
    const robotConfig = data.definition.robotFramework as RobotFrameworkConfig | undefined;
    const instance = nodeInstances.get(node.id);

    if (!robotConfig || !instance) return;

    if (robotConfig.isTeardown) {
      teardownKeyword = robotConfig.keyword;
      return;
    }

    // Pre-keyword log with instance-specific variable substitution
    if (robotConfig.preKeywordLog) {
      let logMsg = substituteStatementVariables(
        robotConfig.preKeywordLog,
        instance,
        robotConfig,
        sessionContext
      );
      lines.push(`    Log To Console    \\n${logMsg}`);
    }

    // NEW: Pre-keyword statements (e.g., Sleep)
    if (robotConfig.preKeywordStatements && robotConfig.preKeywordStatements.length > 0) {
      robotConfig.preKeywordStatements.forEach(stmt => {
        const resolvedStmt = substituteStatementVariables(
          stmt,
          instance,
          robotConfig,
          sessionContext
        );
        lines.push(`    ${resolvedStmt}`);
      });
    }

    // Build keyword call
    const hasOutput = robotConfig.captureOutput;
    const outputVar = hasOutput 
      ? getInstanceVariableName(robotConfig.captureOutput, instance.variablePrefix)
      : null;
    
    // NEW: Handle captureOutputAsList - use @{} for lists
    const varPrefix = robotConfig.captureOutputAsList ? '@' : '$';
    
    const keywordLine = outputVar
      ? `    ${varPrefix}{${outputVar}}=    ${robotConfig.keyword}`
      : `    ${robotConfig.keyword}`;

    lines.push(keywordLine);

    // Add arguments with connection-aware variable resolution
    if (robotConfig.keywordArgs && robotConfig.keywordArgs.length > 0) {
      robotConfig.keywordArgs
        .sort((a, b) => a.position - b.position)
        .forEach(arg => {
          let argValue: string = '';

          if (arg.staticValue) {
            argValue = arg.staticValue;
          } else if (arg.globalSetting) {
            argValue = `\${${arg.globalSetting}}`;
          } else if (arg.sessionVariable) {
            // NEW: Reference session variable directly
            if (sessionContext.currentSessionVariable) {
              argValue = `\${${sessionContext.currentSessionVariable}}`;
            } else {
              argValue = `\${${arg.sessionVariable}}`;
            }
          } else if (arg.fromInput) {
            // NEW: Get value from connected input
            // Look up what's connected to this input
            const inputSources = connectionContext.inputSources.get(node.id);
            if (inputSources) {
              const sourceNodeId = inputSources.get(arg.fromInput);
              if (sourceNodeId) {
                const sourceInstance = nodeInstances.get(sourceNodeId);
                const sourceNode = nodeMap.get(sourceNodeId);
                if (sourceInstance && sourceNode) {
                  const sourceData = sourceNode.data as OpforNodeData;
                  const sourceRobotConfig = sourceData.definition.robotFramework as RobotFrameworkConfig | undefined;
                  
                  // If the source has a captureOutput, use that variable
                  if (sourceRobotConfig?.captureOutput) {
                    const sourceOutputVar = getInstanceVariableName(
                      sourceRobotConfig.captureOutput,
                      sourceInstance.variablePrefix
                    );
                    argValue = `\${${sourceOutputVar}}`;
                  }
                  // If the source produces a session, use that
                  else if (sourceRobotConfig?.sessionVariable) {
                    argValue = `\${${sourceRobotConfig.sessionVariable}}`;
                  }
                }
              }
            }
            // Fallback if no connection found
            if (!argValue && arg.variableName) {
              argValue = `\${${arg.variableName}}`;
            }
          } else if (arg.param) {
            if (arg.variableRef && arg.variableName) {
              // Use this node's instance-specific variable
              const instanceVarName = getInstanceVariableName(arg.variableName, instance.variablePrefix);
              argValue = `\${${instanceVarName}}`;
            } else {
              // Get raw parameter value
              const value = getParameterValue(arg.param, data);
              let strValue = String(value ?? '');
              
              // AUTO-RESOLVE: If it's a variable reference, resolve based on connections
              if (strValue.startsWith('${') && strValue.endsWith('}')) {
                strValue = resolveVariableReference(
                  strValue,
                  node.id,
                  connectionContext,
                  nodeInstances,
                  nodeMap
                );
              }
              
              argValue = strValue;
            }
          }

          if (argValue) {
            lines.push(`    ...    ${argValue}`);
          }
        });
    }

    // NEW: Post-keyword statements (e.g., extracting from list)
    if (robotConfig.postKeywordStatements && robotConfig.postKeywordStatements.length > 0) {
      robotConfig.postKeywordStatements.forEach(stmt => {
        const resolvedStmt = substituteStatementVariables(
          stmt,
          instance,
          robotConfig,
          sessionContext
        );
        lines.push(`    ${resolvedStmt}`);
      });
    }

    // NEW: Update session context if this node produces a session
    if (robotConfig.sessionVariable) {
      sessionContext.currentSessionVariable = robotConfig.sessionVariable;
      sessionContext.producerNodeId = node.id;
    }

    // Post-keyword log with instance-specific variable substitution
    if (robotConfig.postKeywordLog) {
      let logMsg = substituteStatementVariables(
        robotConfig.postKeywordLog,
        instance,
        robotConfig,
        sessionContext
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

/**
 * Generate the *** Keywords *** section
 */
function generateKeywords(_nodes: Node[]): string {
  return '*** Keywords ***\n';
}

/**
 * Main generator function
 */
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
      meta: {
        totalNodes: 0,
        connectedNodes: 0,
        stagedNodes: 0,
        hasExecutionChain: false,
      },
    };
  }

  // Build supporting data structures
  const nodeMap = new Map(validNodes.map(n => [n.id, n]));
  const nodeInstances = buildNodeInstances(validNodes);
  const connectionContext = buildConnectionContext(edges);

  // Log instance info for debugging
  const instanceCounts = new Map<string, number>();
  nodeInstances.forEach(inst => {
    instanceCounts.set(inst.moduleId, Math.max(instanceCounts.get(inst.moduleId) || 0, inst.instanceIndex));
  });
  instanceCounts.forEach((count, moduleId) => {
    if (count > 1) {
      warnings.push(`Multiple instances of "${moduleId}": ${count} (variables suffixed _2, _3, etc.)`);
    }
  });

  // Determine connected nodes
  const connectedNodeIds = getConnectedNodes(validNodes, edges);
  const connectedNodes = validNodes.filter(n => connectedNodeIds.has(n.id));
  
  const sortedConnectedNodes = connectedNodes.length > 0 
    ? topologicalSort(connectedNodes, edges)
    : [];

  // Generate sections
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

  // Check for missing configs
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

  const full = [
    settings,
    '',
    '',
    variables,
    '',
    '',
    testCases,
  ].join('\n');

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

/**
 * Download the generated script as a .robot file
 */
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