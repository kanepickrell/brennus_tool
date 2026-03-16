// src/services/nodeInstanceUtils.ts
// Shared utilities for node instance tracking and variable resolution
// Used by both robotScriptGenerator and PropertiesPanel

import { Node, Edge } from '@xyflow/react';
import { OpforNodeData } from '@/types/opfor';

/**
 * Instance tracking for unique variable naming
 */
export interface NodeInstance {
  node: Node;
  instanceIndex: number;      // 1-based index for this module type
  moduleId: string;           // The base module ID (e.g., "cs-create-listener")
  variablePrefix: string;     // e.g., "" for first instance, "_2" for second
}

/**
 * Connection context - maps node inputs to their source nodes
 */
export interface ConnectionContext {
  /** Map of nodeId -> { inputId -> sourceNodeId } */
  inputSources: Map<string, Map<string, string>>;
  /** Map of nodeId -> { outputId -> targetNodeIds[] } */
  outputTargets: Map<string, Map<string, string[]>>;
}

/**
 * Result of resolving a variable reference
 */
export interface ResolvedVariable {
  /** The original value (e.g., "${LISTENER_NAME}") */
  original: string;
  /** The resolved value (e.g., "${LISTENER_NAME_3}") */
  resolved: string;
  /** Whether resolution occurred */
  wasResolved: boolean;
  /** Source node name if resolved */
  sourceNodeName?: string;
  /** Source node ID if resolved */
  sourceNodeId?: string;
  /** The instance index of the source */
  sourceInstanceIndex?: number;
}

/**
 * Build instance tracking for all nodes
 * Assigns unique instance numbers to nodes of the same module type
 */
export function buildNodeInstances(nodes: Node[]): Map<string, NodeInstance> {
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
 * Build connection context from edges
 */
export function buildConnectionContext(edges: Edge[]): ConnectionContext {
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
 * Get the instance-specific variable name
 */
export function getInstanceVariableName(baseName: string, prefix: string): string {
  if (!prefix) return baseName;
  return `${baseName}${prefix}`;
}

/**
 * Robot Framework config interface (subset needed for resolution)
 */
interface RobotFrameworkConfig {
  variables?: Array<{
    name: string;
    fromParam?: string;
    scope: string;
  }>;
}

/**
 * Resolve a variable reference based on canvas connections
 * 
 * If a parameter value is like ${LISTENER_NAME}, we check if this node
 * has an input connected to a node that produces LISTENER_NAME variables.
 * If so, we return the source node's instance-specific variable.
 */
export function resolveVariableReference(
  varRef: string,
  currentNodeId: string,
  connectionContext: ConnectionContext,
  nodeInstances: Map<string, NodeInstance>,
  nodeMap: Map<string, Node>
): ResolvedVariable {
  // Default result - no resolution
  const defaultResult: ResolvedVariable = {
    original: varRef,
    resolved: varRef,
    wasResolved: false,
  };

  // Check if it's a variable reference
  if (!varRef.startsWith('${') || !varRef.endsWith('}')) {
    return defaultResult;
  }

  const baseVarName = varRef.slice(2, -1); // e.g., "LISTENER_NAME"
  
  // Get the category prefix (e.g., "LISTENER" from "LISTENER_NAME")
  const varCategory = baseVarName.split('_')[0];

  // Look at what's connected to this node's inputs
  const inputSources = connectionContext.inputSources.get(currentNodeId);
  if (!inputSources) {
    return defaultResult;
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
        return {
          original: varRef,
          resolved: `\${${instanceVarName}}`,
          wasResolved: true,
          sourceNodeName: sourceData.definition.name,
          sourceNodeId: sourceNodeId,
          sourceInstanceIndex: sourceInstance.instanceIndex,
        };
      }
    }
  }

  return defaultResult;
}

/**
 * Get all resolved variables for a node's parameters
 * Returns a map of paramId -> ResolvedVariable
 */
export function resolveNodeParameters(
  nodeId: string,
  nodeData: OpforNodeData,
  connectionContext: ConnectionContext,
  nodeInstances: Map<string, NodeInstance>,
  nodeMap: Map<string, Node>
): Map<string, ResolvedVariable> {
  const resolved = new Map<string, ResolvedVariable>();

  if (!nodeData.parameters) return resolved;

  Object.entries(nodeData.parameters).forEach(([paramId, value]) => {
    const strValue = String(value ?? '');
    
    if (strValue.startsWith('${') && strValue.endsWith('}')) {
      const resolution = resolveVariableReference(
        strValue,
        nodeId,
        connectionContext,
        nodeInstances,
        nodeMap
      );
      resolved.set(paramId, resolution);
    }
  });

  return resolved;
}