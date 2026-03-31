// ═══════════════════════════════════════════════════════════════════════════
// FILE 1: src/lib/tokenValidation.ts
// Token prerequisite enforcement — reads rules stored in payload JSON,
// enforces them in Lumen. Rules are authored in ProtoGraph, not hardcoded here.
// ═══════════════════════════════════════════════════════════════════════════

import { Node } from "@xyflow/react";
import { OpforNodeData, OpforNodeDefinition } from "@/types/opfor";

export type TokenId =
  | "C2_Server"
  | "Listener"
  | "Agent_Session"
  | "Credentials"
  | "File"
  | "SSH_Connection";

export interface TokenValidationResult {
  /** Can this module be added to the canvas right now? */
  canAdd: boolean;
  /** Missing prerequisite token types */
  missingTokens: TokenId[];
  /** Human-readable warning for Lumen UI */
  warning: string | null;
}

/**
 * Get all token types currently produced by nodes on the canvas.
 * A token is "available" if any node on the canvas has it in its outputs array.
 */
export function getAvailableTokens(nodes: Node[]): Set<TokenId> {
  const available = new Set<TokenId>();
  for (const node of nodes) {
    const data = node.data as OpforNodeData;
    const outputs = data?.definition?.outputs ?? [];
    for (const output of outputs) {
      if (output.type) available.add(output.type as TokenId);
    }
  }
  return available;
}

/**
 * Check whether a module's prerequisites are satisfied by the current canvas.
 * Rules come entirely from the module's inputs array — authored in ProtoGraph.
 */
export function validateModulePrerequisites(
  definition: OpforNodeDefinition,
  canvasNodes: Node[]
): TokenValidationResult {
  const required = (definition.inputs ?? [])
    .filter((i) => i.required)
    .map((i) => i.type as TokenId);

  if (required.length === 0) {
    return { canAdd: true, missingTokens: [], warning: null };
  }

  const available = getAvailableTokens(canvasNodes);
  const missing = required.filter((t) => !available.has(t));

  if (missing.length === 0) {
    return { canAdd: true, missingTokens: [], warning: null };
  }

  const TOKEN_LABELS: Record<TokenId, string> = {
    C2_Server:      "C2 Server",
    Listener:       "C2 Listener",
    Agent_Session:  "Beacon Session",
    Credentials:    "Credentials",
    File:           "File",
    SSH_Connection: "SSH Connection",
  };

  const missingLabels = missing.map((t) => TOKEN_LABELS[t] ?? t).join(", ");
  const warning = `Requires: ${missingLabels}`;

  return { canAdd: false, missingTokens: missing, warning };
}

/**
 * Full canvas validation — called by Validate button in Lumen toolbar.
 * Returns all prerequisite violations across every node.
 * Used to hard-block export.
 */
export interface CanvasValidationViolation {
  nodeId: string;
  nodeName: string;
  missingTokens: TokenId[];
  warning: string;
}

export function validateCanvas(nodes: Node[]): CanvasValidationViolation[] {
  const violations: CanvasValidationViolation[] = [];

  // Build cumulative token availability as we walk the canvas
  // (in topological order ideally, but for prerequisite checking
  //  we check against ALL nodes currently on canvas — same logic as soft-warn)
  const available = getAvailableTokens(nodes);

  for (const node of nodes) {
    const data = node.data as OpforNodeData;
    const definition = data?.definition;
    if (!definition) continue;

    const required = (definition.inputs ?? [])
      .filter((i) => i.required)
      .map((i) => i.type as TokenId);

    const missing = required.filter((t) => !available.has(t));

    if (missing.length > 0) {
      const TOKEN_LABELS: Record<TokenId, string> = {
        C2_Server:      "C2 Server",
        Listener:       "C2 Listener",
        Agent_Session:  "Beacon Session",
        Credentials:    "Credentials",
        File:           "File",
        SSH_Connection: "SSH Connection",
      };
      violations.push({
        nodeId: node.id,
        nodeName: definition.name,
        missingTokens: missing,
        warning: `"${definition.name}" requires ${missing.map((t) => TOKEN_LABELS[t]).join(", ")}`,
      });
    }
  }

  return violations;
}


// ═══════════════════════════════════════════════════════════════════════════
// FILE 2: NodePalette changes
// Add to the existing NodePalette.tsx — soft-warn badge on module cards
// that have unmet prerequisites.
//
// PASTE THIS where the module card is rendered in NodePalette.tsx,
// replacing the existing card div inside categories.map > cat.nodes.map
// ═══════════════════════════════════════════════════════════════════════════

/*

// Add this import at the top of NodePalette.tsx:
import { validateModulePrerequisites } from "@/lib/tokenValidation";

// Add `canvasNodes` to the NodePalette props interface:
interface NodePaletteProps {
  onDragStart: (e: React.DragEvent, node: OpforNodeDefinition) => void;
  tacticFilter?: string | null;
  onClearTacticFilter?: () => void;
  canvasNodes?: Node[];  // ADD THIS
}

// Update the function signature:
export function NodePalette({ onDragStart, tacticFilter, onClearTacticFilter, canvasNodes = [] }: NodePaletteProps) {

// Replace the node card div inside categories.map > cat.nodes.map with:

  const validation = validateModulePrerequisites(node, canvasNodes);
  const isBlocked = !validation.canAdd;

  return (
    <div
      key={node.id}
      draggable
      onDragStart={e => onDragStart(e, node)}
      className={cn(
        'flex items-center gap-2 p-2 rounded bg-zinc-900/50 border border-zinc-800',
        'cursor-grab hover:border-zinc-600 hover:bg-zinc-900 transition-colors',
        'active:cursor-grabbing active:scale-95 relative',
        isBlocked && 'opacity-60',
      )}
      title={isBlocked ? validation.warning ?? undefined : undefined}
    >
      <span className="text-base flex-shrink-0">{node.icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-zinc-200 font-medium truncate block">
          {node.name}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn(
            'text-[9px] font-bold uppercase',
            node.riskLevel === 'critical' ? 'text-red-500'    :
            node.riskLevel === 'high'     ? 'text-orange-500' :
            node.riskLevel === 'medium'   ? 'text-yellow-500' :
            'text-green-500',
          )}>
            {node.riskLevel || 'medium'}
          </span>
          {badge && (
            <span style={{ fontSize: '9px', fontWeight: 700, padding: '0px 4px', borderRadius: '3px',
              background: badge.hex + '22', color: badge.hex, border: `1px solid ${badge.hex}55` }}
              title={badge.label}>
              {badge.abbr}
            </span>
          )}
          {isBlocked && (
            <span className="text-[9px] text-amber-500/80 ml-auto flex items-center gap-0.5" title={validation.warning ?? undefined}>
              ⚠ prereq
            </span>
          )}
        </div>
      </div>
    </div>
  );

*/


// ═══════════════════════════════════════════════════════════════════════════
// FILE 3: WorkflowBuilder changes
// Pass canvasNodes to NodePalette, and wire validateCanvas into handleValidate.
// ═══════════════════════════════════════════════════════════════════════════

/*

// Add import at top of WorkflowBuilder.tsx:
import { validateCanvas, CanvasValidationViolation } from "@/lib/tokenValidation";

// In the NodePalette render (both canvas and script view), add canvasNodes:
<NodePalette
  onDragStart={onDragStart}
  tacticFilter={tacticFilter}
  onClearTacticFilter={() => setTacticFilter(null)}
  canvasNodes={nodes}   // ADD THIS
/>

// In handleValidate, ADD token prerequisite check after the existing
// parameter validation, before the final toast:

const tokenViolations = validateCanvas(nodes);
if (tokenViolations.length > 0) {
  hasIssues = true;
  tokenViolations.forEach((v) => {
    issues.push(v.warning);
    // Mark the violating node
    const nodeIdx = updatedNodes.findIndex((n) => n.id === v.nodeId);
    if (nodeIdx >= 0) {
      updatedNodes[nodeIdx] = {
        ...updatedNodes[nodeIdx],
        data: { ...updatedNodes[nodeIdx].data, validationState: "configured" } as OpforNodeData,
      };
    }
  });
}

// In ReadinessCheck, the existing "required parameters" check already
// runs before export — add token violations there too for the hard-block.
// In ReadinessCheck.tsx, inside useReadinessResults, add after the params check:

import { validateCanvas } from "@/lib/tokenValidation";

// Inside the technical checks array:
const tokenViolations = validateCanvas(nodes);
technical.push({
  id: 'token-prereqs',
  label: 'Prerequisite tokens satisfied',
  status: tokenViolations.length === 0 ? 'pass' : 'fail',
  detail: tokenViolations.length > 0
    ? tokenViolations.map(v => v.warning).join('; ')
    : 'All module prerequisites met',
});

*/