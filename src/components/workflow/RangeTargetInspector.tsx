import React, { useCallback, useMemo, useState } from 'react';
import type {
  RangeTargetData,
  RangeTargetField,
  RangeTargetEmitMode,
} from '../../types/opforRangeTarget';
import { RANGE_TARGET_TEMPLATES, slugTargetName } from '../../data/rangeTargets';

/**
 * RangeTargetInspector — right-panel editor for a selected rangeTargetNode.
 *
 * Mounts inside CollapsiblePropertiesPanel when the selected node has
 * type === 'rangeTargetNode'. The parent PropertiesPanel container routes
 * selection to either the existing opforNode inspector or this component.
 *
 * Edits flow through onDataChange, which the WorkflowBuilder wires up to
 * the same mechanism as opforNode parameter edits (setNodes + partial data
 * merge). This component is purely controlled — it does not own state
 * beyond transient UI concerns (the show-password toggle).
 */

export interface RangeTargetInspectorProps {
  data: RangeTargetData;
  /** Called with a partial data patch. Parent merges into the node's data. */
  onDataChange: (patch: Partial<RangeTargetData>) => void;
  /** Operator requested deletion of this target. */
  onDelete?: () => void;
}

export function RangeTargetInspector({
  data,
  onDataChange,
  onDelete,
}: RangeTargetInspectorProps) {
  const template = RANGE_TARGET_TEMPLATES[data.kind];

  // Local ephemeral state for show/hide password toggles, keyed by field id.
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const updateField = useCallback(
    (fieldId: string, patch: Partial<RangeTargetField>) => {
      const current = data.fields[fieldId];
      if (!current) return;
      onDataChange({
        fields: {
          ...data.fields,
          [fieldId]: { ...current, ...patch },
        },
      });
    },
    [data.fields, onDataChange],
  );

  const setName = useCallback(
    (newName: string) => {
      onDataChange({ name: newName });
    },
    [onDataChange],
  );

  const setNotes = useCallback(
    (newNotes: string) => {
      onDataChange({ notes: newNotes });
    },
    [onDataChange],
  );

  const fieldList = useMemo(() => Object.values(data.fields), [data.fields]);
  const hasSensitive = useMemo(
    () => fieldList.some((f) => f.sensitive),
    [fieldList],
  );

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start gap-3 pb-3 border-b border-slate-200">
        <span className="text-3xl leading-none">{data.icon || template?.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            {template?.label ?? data.kind}
          </div>
          <input
            type="text"
            value={data.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Target name (e.g. WIN-DC01)"
            className="mt-0.5 w-full text-base font-semibold text-slate-800 bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-sky-400 focus:outline-none px-0 py-0.5"
          />
          <div className="mt-1 text-[11px] text-slate-500">
            Robot prefix:{' '}
            <code className="font-mono text-slate-700">
              ${'{'}TARGET_{data.name ? slugTargetName(data.name) : '...'}_*{'}'}
            </code>
          </div>
        </div>
      </div>

      {/* Helper hint */}
      {template?.description && (
        <div className="text-xs text-slate-500 italic -mt-2">
          {template.description}
        </div>
      )}

      {/* Fields */}
      <div className="space-y-3">
        {fieldList.map((field) => {
          const isPassword = field.type === 'password';
          const isSelect = field.type === 'select';
          const isNumber = field.type === 'number';
          const isRevealed = !!revealed[field.id];

          return (
            <div key={field.id}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">
                  {field.label}
                  {field.sensitive && (
                    <span className="ml-1.5 px-1 py-0.5 text-[9px] uppercase tracking-wide bg-amber-100 text-amber-700 rounded">
                      sensitive
                    </span>
                  )}
                  {field.suggestsFor && field.suggestsFor.length > 0 && (
                    <span
                      className="ml-1.5 text-[10px] text-slate-400"
                      title={`Connectable. Feeds: ${field.suggestsFor.join(', ')}`}
                    >
                      ⇢
                    </span>
                  )}
                </label>
                {isPassword && (
                  <button
                    type="button"
                    onClick={() =>
                      setRevealed((r) => ({ ...r, [field.id]: !r[field.id] }))
                    }
                    className="text-[10px] text-sky-600 hover:text-sky-800 underline"
                  >
                    {isRevealed ? 'hide' : 'show'}
                  </button>
                )}
              </div>

              {isSelect ? (
                <select
                  value={field.value}
                  onChange={(e) => updateField(field.id, { value: e.target.value })}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-sky-400 focus:ring-1 focus:ring-sky-200 focus:outline-none"
                >
                  <option value="">— choose —</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={isPassword && !isRevealed ? 'password' : isNumber ? 'number' : 'text'}
                  value={field.value}
                  placeholder={field.placeholder}
                  onChange={(e) => updateField(field.id, { value: e.target.value })}
                  className="w-full text-sm font-mono border border-slate-300 rounded px-2 py-1.5 focus:border-sky-400 focus:ring-1 focus:ring-sky-200 focus:outline-none"
                />
              )}

              {/* Per-field emit mode toggle for sensitive fields */}
              {field.sensitive && (
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  <span className="text-slate-500">Emit as:</span>
                  <EmitModeToggle
                    value={field.emitMode ?? 'plain'}
                    onChange={(mode) => updateField(field.id, { emitMode: mode })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Notes (not emitted)
        </label>
        <textarea
          value={data.notes ?? ''}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Operator notes — rules of engagement, quirks, reminders."
          className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-sky-400 focus:ring-1 focus:ring-sky-200 focus:outline-none resize-y"
        />
      </div>

      {/* Footer: emit-mode legend + delete */}
      {hasSensitive && (
        <div className="text-[10px] text-slate-500 border-t border-slate-200 pt-2 space-y-1">
          <div>
            <code className="font-mono bg-slate-100 px-1 rounded">${'{VAR}'}</code>{' '}
            emits literal value into the .robot file.
          </div>
          <div>
            <code className="font-mono bg-slate-100 px-1 rounded">%{'{VAR}'}</code>{' '}
            reads from environment at runtime — export before running.
          </div>
        </div>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-2 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200 rounded px-3 py-1.5 self-start"
        >
          Remove target from canvas
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small UI component: per-field $/env toggle
// ---------------------------------------------------------------------------

interface EmitModeToggleProps {
  value: RangeTargetEmitMode;
  onChange: (mode: RangeTargetEmitMode) => void;
}

function EmitModeToggle({ value, onChange }: EmitModeToggleProps) {
  return (
    <div className="inline-flex border border-slate-300 rounded overflow-hidden text-[11px]">
      <button
        type="button"
        onClick={() => onChange('plain')}
        className={[
          'px-2 py-0.5 transition-colors',
          value === 'plain'
            ? 'bg-sky-100 text-sky-800 font-medium'
            : 'bg-white text-slate-600 hover:bg-slate-50',
        ].join(' ')}
        title="Emit literal value into .robot"
      >
        ${'{VAR}'}
      </button>
      <button
        type="button"
        onClick={() => onChange('env')}
        className={[
          'px-2 py-0.5 transition-colors border-l border-slate-300',
          value === 'env'
            ? 'bg-sky-100 text-sky-800 font-medium'
            : 'bg-white text-slate-600 hover:bg-slate-50',
        ].join(' ')}
        title="Read from environment variable at runtime"
      >
        %{'{ENV}'}
      </button>
    </div>
  );
}