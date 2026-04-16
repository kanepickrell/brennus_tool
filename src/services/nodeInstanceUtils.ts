// src/services/nodeInstanceUtils.ts
//
// Shared utilities for node instance tracking.
//
// Variable-resolution logic has been consolidated into ./variableResolution
// to remove the duplicate implementations that previously lived here and in
// robotScriptGenerator. Consumers that previously imported resolution
// primitives from this file should import them from ./variableResolution
// directly. We keep a small set of re-exports here for callers that haven't
// been migrated yet — kept as a SINGLE consolidated block to avoid
// import/re-export interleaving that has produced bundler TDZ issues in the
// past.

import type { Node } from '@xyflow/react';
import type { OpforNodeData } from '@/types/opfor';

// Single consolidated import from variableResolution for both internal use
// and re-export. Don't mix `import` and `export ... from` for the same names
// in the same file — some bundlers hoist the re-export and TDZ on the
// adjacent `import`.
import {
  resolveVariableReference,
  buildConnectionContext,
  extractCategory,
  unwrapVariableRef,
  collectTargetSuggestions,
  type ConnectionContext,
  type InputSources,
  type OutputTargets,
  type ResolutionResult,
  type ResolvedVariable,
  type ResolutionSourceNode,
  type TargetSuggestion,
  type EdgeLike,
} from './variableResolution';

// Plain value re-exports (no circular-ref surface).
export {
  resolveVariableReference,
  buildConnectionContext,
  extractCategory,
  unwrapVariableRef,
  collectTargetSuggestions,
};

// Type re-exports.
export type {
  ConnectionContext,
  InputSources,
  OutputTargets,
  ResolutionResult,
  ResolvedVariable,
  ResolutionSourceNode,
  TargetSuggestion,
  EdgeLike,
};

// ---------------------------------------------------------------------------
// Instance tracking for unique variable naming
// ---------------------------------------------------------------------------

export interface NodeInstance {
  node: Node;
  instanceIndex: number;   // 1-based index for this module type
  moduleId: string;        // Base module ID (e.g., "cs-create-listener")
  variablePrefix: string;  // "" for first instance, "_2" for second, ...
}

/**
 * Build instance tracking for all nodes. Assigns unique instance numbers to
 * nodes of the same module type, so duplicate modules get non-colliding
 * Robot variable names.
 */
export function buildNodeInstances(nodes: Node[]): Map<string, NodeInstance> {
  const instances = new Map<string, NodeInstance>();
  const moduleCount = new Map<string, number>();

  nodes.forEach(node => {
    const data = node.data as OpforNodeData | undefined;
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
 * Get the instance-specific variable name by appending the instance prefix.
 * First instance: baseName. Second: baseName_2. Third: baseName_3. Etc.
 */
export function getInstanceVariableName(baseName: string, prefix: string): string {
  if (!prefix) return baseName;
  return `${baseName}${prefix}`;
}

/**
 * Get all resolved variables for a node's parameters.
 * Returns a map of paramId -> ResolutionResult, keyed only for params whose
 * current value is a ${VAR} reference AND that actually resolve to something
 * via an upstream connection.
 */
export function resolveNodeParameters(
  nodeId: string,
  nodeData: OpforNodeData,
  connectionContext: ConnectionContext,
  nodeInstances: Map<string, NodeInstance>,
  nodeMap: Map<string, Node>
): Map<string, ResolutionResult> {
  const resolved = new Map<string, ResolutionResult>();

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
      if (resolution) {
        resolved.set(paramId, resolution);
      }
    }
  });

  return resolved;
}