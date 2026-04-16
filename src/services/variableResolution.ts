// src/services/variableResolution.ts
//
// Single source of truth for resolving `${VAR}` references across connected
// nodes on the canvas.
//
// Previously, this logic lived in two places:
//   - src/services/nodeInstanceUtils.ts (used by PropertiesPanel live hints)
//   - src/services/robotScriptGenerator.ts (used at .robot emission)
//
// This module replaces both. nodeInstanceUtils.ts re-exports from here for
// backward compat; the inlined copy in robotScriptGenerator.ts should be
// deleted in favor of importing from here.
//
// Scope of resolution:
//   - opforNode -> opforNode: category match against upstream's
//     robotFramework.variables array (original behavior, unchanged)
//   - rangeTargetNode -> opforNode: category match against the target's
//     field.suggestsFor arrays (new)
//
// Precedence when both apply: opforNode sources win, because those represent
// values produced by earlier keywords in the trigger chain and are
// semantically stronger than static target data.

import type { RangeTargetData, RangeTargetField } from '../types/opforRangeTarget';
import { targetFieldReference } from '../data/rangeTargets';

// ---------------------------------------------------------------------------
// Connection context types
// ---------------------------------------------------------------------------

/** Map<targetNodeId, Record<targetHandleId, sourceNodeId>> */
export type InputSources = Map<string, Record<string, string>>;

/** Reverse of InputSources. Not consumed by resolution itself. */
export type OutputTargets = Map<string, Record<string, string[]>>;

export interface ConnectionContext {
  inputSources: InputSources;
  outputTargets: OutputTargets;
}

/**
 * Minimal source-node view. Accepts either an opforNode or a rangeTargetNode.
 *
 * Structural typing here (rather than importing the full Node<OpforNodeData>)
 * keeps this module free of a circular dep with opfor.ts.
 *
 * For opforNode sources, produced variables may live at either:
 *   - data.definition.robotFramework.variables  (current schema)
 *   - data.robotFramework.variables              (legacy flat schema)
 * and elements may be strings OR { name, scope } objects. We handle all four
 * combinations.
 */
export interface ResolutionSourceNode {
  id: string;
  type?: string;
  data: {
    definition?: {
      name?: string;
      robotFramework?: {
        variables?: Array<{ name: string; scope?: string } | string>;
      };
    };
    label?: string;
    displayName?: string;
    name?: string;
    robotFramework?: {
      variables?: Array<{ name: string; scope?: string } | string>;
    };
    variablePrefix?: string;

    // rangeTargetNode fields
    targetId?: string;
    icon?: string;
    fields?: Record<string, RangeTargetField>;

    [k: string]: unknown;
  };
}

/**
 * Legacy instance-tracking shape accepted by the 5-arg legacy signature.
 * Comes straight from nodeInstanceUtils.ts `NodeInstance`.
 */
export interface NodeInstanceLike {
  variablePrefix?: string;
  instanceIndex?: number;
  moduleId?: string;
  node?: { id: string; type?: string; data?: unknown };
}

export interface ResolutionResult {
  /**
   * Rewritten reference, ready to paste into a .robot line.
   *   plain:    `${HTTP_LISTENER_2}`
   *   env mode: `%{TARGET_WIN_01_PASSWORD}`
   * Callers should use this verbatim. Do NOT re-wrap with `${...}`.
   */
  resolvedReference: string;
  /** Bare identifier (no `${}` or `%{}` wrapping). */
  resolvedName: string;
  sourceKind: 'opfor' | 'target';
  sourceNodeId: string;
  sourceLabel: string;

  // ---- Legacy ResolvedVariable fields (kept for PropertiesPanel compat) ----
  /**
   * Legacy name for the resolved variable reference as a display string.
   * PropertiesPanel renders this inline (e.g. `<span>{resolvedVariable.resolved}</span>`).
   * Same value as `resolvedReference`.
   */
  resolved: string;
  /**
   * Legacy flag indicating successful resolution. Always true for non-null
   * results. PropertiesPanel checks `resolvedVariable?.wasResolved === true`.
   */
  wasResolved: true;
  /**
   * Legacy alias for sourceLabel. PropertiesPanel reads `sourceNodeName`.
   */
  sourceNodeName: string;
  /** Additional legacy alias for code paths that read `sourceName`. */
  sourceName: string;
}

/**
 * Legacy type alias. PropertiesPanel imports this name from nodeInstanceUtils.
 */
export type ResolvedVariable = ResolutionResult;

// ---------------------------------------------------------------------------
// Category extraction
// ---------------------------------------------------------------------------

/**
 * Strips `${...}` / `%{...}` and returns the inner identifier, or null if
 * the input isn't a wrapped Robot variable reference.
 */
export function unwrapVariableRef(ref: string): string | null {
  const trimmed = ref.trim();
  const m = trimmed.match(/^[$%]\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  return m ? m[1] : null;
}

/**
 * First underscore-delimited segment. Matches pre-consolidation behavior.
 *   LISTENER_NAME       -> LISTENER
 *   TARGET_IP           -> TARGET
 *   HTTP_LISTENER_PORT  -> HTTP
 */
export function extractCategory(identifier: string): string {
  const idx = identifier.indexOf('_');
  return idx === -1 ? identifier : identifier.slice(0, idx);
}

// ---------------------------------------------------------------------------
// opforNode helpers
// ---------------------------------------------------------------------------

function producedVariables(source: ResolutionSourceNode): string[] {
  const rf =
    source.data.definition?.robotFramework ??
    source.data.robotFramework ??
    undefined;
  const vars = rf?.variables;
  if (!vars || vars.length === 0) return [];

  const names: string[] = [];
  for (const v of vars) {
    if (typeof v === 'string') names.push(v);
    else if (v && typeof v === 'object' && typeof v.name === 'string') names.push(v.name);
  }
  return names;
}

function sourceLabelFor(src: ResolutionSourceNode): string {
  const d = src.data;
  return String(
    (d as { displayName?: string }).displayName ||
      (d as { label?: string }).label ||
      (d as { definition?: { name?: string } }).definition?.name ||
      (d as { name?: string }).name ||
      src.id,
  );
}

function matchOpforSource(
  source: ResolutionSourceNode,
  wantedCategory: string,
  instancePrefixFromInstances?: string,
): string | null {
  const names = producedVariables(source);
  if (names.length === 0) return null;

  for (const n of names) {
    if (extractCategory(n) === wantedCategory) {
      const prefix = instancePrefixFromInstances ?? source.data.variablePrefix ?? '';
      return `${n}${prefix}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// rangeTargetNode helpers
// ---------------------------------------------------------------------------

function matchTargetSource(
  source: ResolutionSourceNode,
  wantedCategory: string,
  wantedIdentifier: string,
): { field: RangeTargetField; reference: string; name: string } | null {
  const fields = source.data.fields;
  const targetName = (source.data as { name?: string }).name;
  if (!fields || !targetName) return null;

  for (const field of Object.values(fields)) {
    if (!field.suggestsFor || field.suggestsFor.length === 0) continue;

    const matched = field.suggestsFor.some(
      (s) => s === wantedCategory || s === wantedIdentifier,
    );
    if (!matched) continue;

    const reference = targetFieldReference(targetName, field);
    const bare = reference.replace(/^[$%]\{|\}$/g, '');
    return { field, reference, name: bare };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main entry point — dual-signature for backward compatibility
// ---------------------------------------------------------------------------

/**
 * Resolve a `${VAR}` reference for `currentNodeId` against connected upstream
 * sources.
 *
 * Two calling conventions supported:
 *
 *   NEW (4-arg, preferred — used by robotScriptGenerator):
 *     resolveVariableReference(ref, nodeId, allNodes, context)
 *
 *   LEGACY (5-arg — used by PropertiesPanel and resolveNodeParameters):
 *     resolveVariableReference(ref, nodeId, context, nodeInstances, nodeMap)
 *
 * Dispatch is by arg-shape: if arg3 is an array we use the new form; if arg3
 * has an `.inputSources` Map we use the legacy form and derive `allNodes`
 * from arg5 (the nodeMap).
 *
 * Returns null when nothing connected produces a matching variable.
 */
export function resolveVariableReference(
  variableRef: string,
  currentNodeId: string,
  arg3: ResolutionSourceNode[] | ConnectionContext,
  arg4?: ConnectionContext | Map<string, NodeInstanceLike>,
  arg5?: Map<string, ResolutionSourceNode>,
): ResolutionResult | null {
  const identifier = unwrapVariableRef(variableRef) ?? variableRef.trim();
  if (!identifier) return null;

  // ---- Signature detection -------------------------------------------------
  let allNodes: ResolutionSourceNode[] = [];
  let context: ConnectionContext | undefined;
  let nodeInstances: Map<string, NodeInstanceLike> | undefined;

  const arg3IsArray = Array.isArray(arg3);
  const arg3LooksLikeContext =
    !arg3IsArray &&
    arg3 !== null &&
    typeof arg3 === 'object' &&
    'inputSources' in (arg3 as object);

  if (arg3IsArray) {
    // NEW form
    allNodes = arg3 as ResolutionSourceNode[];
    context = arg4 as ConnectionContext | undefined;
  } else if (arg3LooksLikeContext) {
    // LEGACY form
    context = arg3 as ConnectionContext;
    nodeInstances = arg4 as Map<string, NodeInstanceLike> | undefined;
    if (arg5 && typeof arg5.values === 'function') {
      allNodes = Array.from(arg5.values());
    } else {
      allNodes = [];
    }
  } else {
    // Unrecognized — bail safely rather than throw.
    return null;
  }

  // Defensive guards — legacy call path can hand us partial state during the
  // initial mount before useMemo has produced all the maps.
  if (!context || !context.inputSources || typeof context.inputSources.get !== 'function') {
    return null;
  }

  const wantedCategory = extractCategory(identifier);
  const handlesForNode = context.inputSources.get(currentNodeId);
  if (!handlesForNode) return null;

  const sourceIds = Array.from(new Set(Object.values(handlesForNode)));
  const sourceNodes = sourceIds
    .map((sid) => allNodes.find((n) => n.id === sid))
    .filter((n): n is ResolutionSourceNode => !!n);

  // Pass 1: opforNode sources ------------------------------------------------
  for (const src of sourceNodes) {
    if (src.type !== 'opforNode') continue;
    const instancePrefix = nodeInstances?.get(src.id)?.variablePrefix;
    const resolved = matchOpforSource(src, wantedCategory, instancePrefix);
    if (resolved) {
      const label = sourceLabelFor(src);
      const ref = `\${${resolved}}`;
      return {
        resolvedReference: ref,
        resolvedName: resolved,
        sourceKind: 'opfor',
        sourceNodeId: src.id,
        sourceLabel: label,
        sourceName: label,
        sourceNodeName: label,
        resolved: ref,
        wasResolved: true,
      };
    }
  }

  // Pass 2: rangeTargetNode sources -----------------------------------------
  for (const src of sourceNodes) {
    if (src.type !== 'rangeTargetNode') continue;
    const matched = matchTargetSource(src, wantedCategory, identifier);
    if (matched) {
      const label = String((src.data as { name?: string }).name ?? src.id);
      return {
        resolvedReference: matched.reference,
        resolvedName: matched.name,
        sourceKind: 'target',
        sourceNodeId: src.id,
        sourceLabel: label,
        sourceName: label,
        sourceNodeName: label,
        resolved: matched.reference,
        wasResolved: true,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Connection context builder
// ---------------------------------------------------------------------------

export interface EdgeLike {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/**
 * Build inputSources / outputTargets maps from an edge list.
 *
 * Trigger edges (`trigger-out` -> `trigger-in`) ARE included — variable
 * resolution historically walks them for category matching across the
 * trigger chain.
 */
export function buildConnectionContext(edges: EdgeLike[]): ConnectionContext {
  const inputSources: InputSources = new Map();
  const outputTargets: OutputTargets = new Map();

  for (const e of edges) {
    const targetHandle = e.targetHandle ?? 'default';
    const sourceHandle = e.sourceHandle ?? 'default';

    if (!inputSources.has(e.target)) inputSources.set(e.target, {});
    inputSources.get(e.target)![targetHandle] = e.source;

    if (!outputTargets.has(e.source)) outputTargets.set(e.source, {});
    const outMap = outputTargets.get(e.source)!;
    if (!outMap[sourceHandle]) outMap[sourceHandle] = [];
    outMap[sourceHandle].push(e.target);
  }

  return { inputSources, outputTargets };
}

// ---------------------------------------------------------------------------
// Target-field suggestions for PropertiesPanel
// ---------------------------------------------------------------------------

export interface TargetSuggestion {
  targetNodeId: string;
  targetName: string;
  targetIcon: string;
  fieldId: string;
  fieldLabel: string;
  /** Masked for sensitive fields. */
  displayValue: string;
  /** The `${VAR}` or `%{VAR}` to store if the operator picks this. */
  reference: string;
}

/**
 * Collect target-field suggestions for a given param on a given consumer
 * node. PropertiesPanel uses this to inject options at the top of the
 * param's dropdown.
 *
 * New-form only: callers always pass (nodeId, paramIdentifier, allNodes, context).
 */
export function collectTargetSuggestions(
  consumerNodeId: string,
  paramIdentifier: string,
  allNodes: ResolutionSourceNode[],
  context: ConnectionContext,
): TargetSuggestion[] {
  if (!context || !context.inputSources || typeof context.inputSources.get !== 'function') {
    return [];
  }
  const wantedCategory = extractCategory(paramIdentifier);
  const handles = context.inputSources.get(consumerNodeId);
  if (!handles) return [];

  const sourceIds = Array.from(new Set(Object.values(handles)));
  const suggestions: TargetSuggestion[] = [];

  for (const sid of sourceIds) {
    const src = allNodes.find((n) => n.id === sid);
    if (!src || src.type !== 'rangeTargetNode') continue;

    const targetData = src.data as unknown as RangeTargetData;
    if (!targetData.fields || !targetData.name) continue;

    for (const field of Object.values(targetData.fields)) {
      if (!field.suggestsFor || field.suggestsFor.length === 0) continue;

      const matches = field.suggestsFor.some(
        (s) => s === wantedCategory || s === paramIdentifier,
      );
      if (!matches) continue;

      suggestions.push({
        targetNodeId: src.id,
        targetName: targetData.name,
        targetIcon: targetData.icon,
        fieldId: field.id,
        fieldLabel: field.label,
        displayValue: field.sensitive ? '••••••••' : field.value || '(unset)',
        reference: targetFieldReference(targetData.name, field),
      });
    }
  }

  return suggestions;
}