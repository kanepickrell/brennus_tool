import React, { memo, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { RangeTargetData } from '../../types/opforRangeTarget';
import { RANGE_TARGET_TEMPLATES } from '../../data/rangeTargets';

/**
 * RangeTargetNode — the canvas card for a piece of target infrastructure.
 *
 * Visual contract:
 *   - Distinct styling from OpforNode. No risk badges, no tactic coloring.
 *     Slate/blue/indigo palette so targets read as "infrastructure."
 *   - Kind icon in the top-right corner.
 *   - Name prominent in the header (operator-facing identifier).
 *   - Compact field preview: first two non-sensitive fields with values.
 *   - One source handle per field that has a non-empty suggestsFor array,
 *     stacked along the right edge. No input handles. No trigger handles.
 *
 * Interaction:
 *   - Handles are pure data outputs. Dragging from one creates a ReactFlow
 *     edge to a command node's `target-in` generic handle. Once connected,
 *     the command's PropertiesPanel surfaces this target's fields as
 *     dropdown suggestions for matching parameters.
 *
 * Edit flow:
 *   - Clicking the node selects it; CollapsiblePropertiesPanel switches to
 *     RangeTargetInspector for editing.
 */

export interface RangeTargetNodeProps {
  data: RangeTargetData;
  selected?: boolean;
}

// Tailwind class maps. React can't compose class strings at runtime from
// dynamic color keys the way Tailwind's JIT expects, so we enumerate.
const colorClasses: Record<
  string,
  {
    border: string;
    borderSelected: string;
    headerBg: string;
    accent: string;
    handle: string;
  }
> = {
  sky: {
    border: 'border-sky-300',
    borderSelected: 'border-sky-500 ring-2 ring-sky-200',
    headerBg: 'bg-sky-50',
    accent: 'text-sky-700',
    handle: '!bg-sky-500',
  },
  blue: {
    border: 'border-blue-300',
    borderSelected: 'border-blue-500 ring-2 ring-blue-200',
    headerBg: 'bg-blue-50',
    accent: 'text-blue-700',
    handle: '!bg-blue-500',
  },
  indigo: {
    border: 'border-indigo-300',
    borderSelected: 'border-indigo-500 ring-2 ring-indigo-200',
    headerBg: 'bg-indigo-50',
    accent: 'text-indigo-700',
    handle: '!bg-indigo-500',
  },
  slate: {
    border: 'border-slate-300',
    borderSelected: 'border-slate-500 ring-2 ring-slate-200',
    headerBg: 'bg-slate-50',
    accent: 'text-slate-700',
    handle: '!bg-slate-500',
  },
  cyan: {
    border: 'border-cyan-300',
    borderSelected: 'border-cyan-500 ring-2 ring-cyan-200',
    headerBg: 'bg-cyan-50',
    accent: 'text-cyan-700',
    handle: '!bg-cyan-500',
  },
};

function RangeTargetNodeComponent({ data, selected }: RangeTargetNodeProps) {
  const template = RANGE_TARGET_TEMPLATES[data.kind];
  const colors = colorClasses[template?.color ?? 'slate'] ?? colorClasses.slate;

  // All connectable fields — these get source handles. Fields without
  // suggestsFor are still editable in the inspector but don't participate
  // in wiring.
  const connectableFields = useMemo(
    () =>
      Object.values(data.fields).filter(
        (f) => f.suggestsFor && f.suggestsFor.length > 0,
      ),
    [data.fields],
  );

  // Preview: first two non-sensitive fields that have a value set.
  const previewFields = useMemo(() => {
    const candidates = Object.values(data.fields).filter(
      (f) => !f.sensitive && f.value,
    );
    return candidates.slice(0, 2);
  }, [data.fields]);

  const totalFieldCount = Object.keys(data.fields).length;
  const setFieldCount = Object.values(data.fields).filter((f) => !!f.value).length;

  return (
    <div
      className={[
        'w-64 rounded-lg border-2 bg-white shadow-sm transition-all',
        selected ? colors.borderSelected : colors.border,
      ].join(' ')}
      data-testid={`range-target-${data.targetId}`}
    >
      {/* Header strip */}
      <div
        className={[
          'flex items-center justify-between rounded-t-md border-b px-3 py-2',
          colors.headerBg,
        ].join(' ')}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-lg leading-none"
            role="img"
            aria-label={template?.label ?? 'Target'}
          >
            {data.icon || template?.icon || '🖥️'}
          </span>
          <div className="min-w-0">
            <div className={['text-sm font-semibold truncate', colors.accent].join(' ')}>
              {data.name || '(unnamed)'}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 truncate">
              {template?.label ?? data.kind}
            </div>
          </div>
        </div>

        <div
          className="text-[10px] font-medium text-slate-500 shrink-0"
          title={`${setFieldCount} of ${totalFieldCount} fields set`}
        >
          {setFieldCount}/{totalFieldCount}
        </div>
      </div>

      {/* Field preview */}
      <div className="px-3 py-2 space-y-1">
        {previewFields.length === 0 ? (
          <div className="text-xs italic text-slate-400">
            Click to configure fields
          </div>
        ) : (
          previewFields.map((f) => (
            <div
              key={f.id}
              className="flex items-baseline justify-between gap-2 text-xs"
            >
              <span className="text-slate-500 shrink-0">{f.label}</span>
              <span
                className="font-mono text-slate-700 truncate text-right"
                title={f.value}
              >
                {f.value}
              </span>
            </div>
          ))
        )}
        {previewFields.length > 0 && setFieldCount > previewFields.length && (
          <div className="text-[10px] text-slate-400 italic">
            +{setFieldCount - previewFields.length} more field
            {setFieldCount - previewFields.length === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {/* Source handles — one per connectable field, stacked down the right edge. */}
      {connectableFields.map((field, idx) => {
        // Distribute handles evenly along the right edge.
        // Top is at ~25% and bottom is at ~85% so they don't crowd corners.
        const topPct = 25 + (60 * idx) / Math.max(1, connectableFields.length - 1);
        const positionStyle =
          connectableFields.length === 1
            ? { top: '50%' }
            : { top: `${topPct}%` };

        return (
          <Handle
            key={field.id}
            type="source"
            position={Position.Right}
            id={`${field.id}-out`}
            className={['w-3 h-3 border-2 border-white', colors.handle].join(' ')}
            style={positionStyle}
            title={`${field.label}${field.value ? `: ${field.sensitive ? '••••' : field.value}` : ' (unset)'}`}
          />
        );
      })}
    </div>
  );
}

export const RangeTargetNode = memo(RangeTargetNodeComponent);
RangeTargetNode.displayName = 'RangeTargetNode';