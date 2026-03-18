// src/components/workflow/JQRPanel.tsx
// JQR Progress Panel — always-visible above right panel tabs
// Derives tactic coverage reactively from canvas nodes

import { useMemo, useState } from 'react';
import { Node } from '@xyflow/react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { JQRProfile, MITRE_TACTICS } from '@/types/campaign';
import { OpforNodeData } from '@/types/opfor';
import { cn } from '@/lib/utils';

interface JQRPanelProps {
  nodes: Node[];
  jqrProfile: JQRProfile | null;
  onFilterTactic?: (tacticId: string) => void; // signals NodePalette to filter
}

// Derive which tactics are covered by current canvas nodes
function useTacticCoverage(nodes: Node[]): Record<string, string[]> {
  return useMemo(() => {
    const coverage: Record<string, string[]> = {};
    for (const node of nodes) {
      const data = node.data as OpforNodeData;
      const tactic = data?.definition?.tactic;
      const name   = data?.definition?.name;
      if (tactic && name) {
        if (!coverage[tactic]) coverage[tactic] = [];
        if (!coverage[tactic].includes(name)) coverage[tactic].push(name);
      }
    }
    return coverage;
  }, [nodes]);
}

export function JQRPanel({ nodes, jqrProfile, onFilterTactic }: JQRPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const coverage = useTacticCoverage(nodes);

  // No profile — render minimal placeholder
  if (!jqrProfile || jqrProfile.requiredTactics.length === 0) {
    return (
      <div className="border-b border-zinc-800 px-3 py-2 flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">
          No JQR Profile Loaded
        </span>
      </div>
    );
  }

  const required   = jqrProfile.requiredTactics;
  const covered    = required.filter(t => coverage[t]?.length > 0);
  const missing    = required.filter(t => !coverage[t]?.length);
  const pct        = required.length > 0 ? Math.round((covered.length / required.length) * 100) : 0;
  const isComplete = pct === 100;

  return (
    <div className="border-b border-zinc-800 flex-shrink-0">
      {/* ── Collapsed bar ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-900/50 transition-colors"
      >
        {/* Profile name */}
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 truncate flex-1 text-left">
          JQR: {jqrProfile.name.replace('318 RANS ', '')}
        </span>

        {/* Compact heatmap */}
        <div className="flex gap-0.5 flex-shrink-0">
          {MITRE_TACTICS.map(t => {
            const isReq  = required.includes(t.id);
            const isCov  = !!coverage[t.id]?.length;
            return (
              <div
                key={t.id}
                title={`${t.label}${isReq ? ' (required)' : ''}`}
                className={cn(
                  'w-2 h-2 rounded-sm transition-colors',
                  isCov && isReq   ? 'bg-green-500'      :
                  !isCov && isReq  ? 'bg-amber-500/80'   :
                  isCov            ? 'bg-zinc-600'        :
                                     'bg-zinc-800'
                )}
              />
            );
          })}
        </div>

        {/* Progress fraction */}
        <span className={cn(
          'text-[9px] font-bold font-mono flex-shrink-0 w-8 text-right',
          isComplete ? 'text-green-400' : missing.length > 0 ? 'text-amber-400' : 'text-zinc-500'
        )}>
          {covered.length}/{required.length}
        </span>

        {expanded
          ? <ChevronUp className="h-3 w-3 text-zinc-600 flex-shrink-0" />
          : <ChevronDown className="h-3 w-3 text-zinc-600 flex-shrink-0" />
        }
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2.5">
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isComplete ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-zinc-600'
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[8px] text-zinc-600 font-mono uppercase tracking-wider">
                Coverage
              </span>
              <span className={cn(
                'text-[9px] font-bold font-mono',
                isComplete ? 'text-green-400' : 'text-amber-400'
              )}>
                {pct}%
              </span>
            </div>
          </div>

          {/* Tactic checklist */}
          <div className="space-y-0.5">
            {required.map(tacticId => {
              const tactic   = MITRE_TACTICS.find(t => t.id === tacticId);
              const modules  = coverage[tacticId] ?? [];
              const isCovered = modules.length > 0;
              return (
                <div
                  key={tacticId}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1 rounded transition-colors',
                    isCovered ? 'bg-green-500/5' : 'bg-amber-500/5'
                  )}
                >
                  {/* Status icon */}
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-sm flex items-center justify-center flex-shrink-0 text-[8px]',
                    isCovered ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-500'
                  )}>
                    {isCovered ? '✓' : '✗'}
                  </div>

                  {/* Tactic label */}
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      'text-[10px] font-medium truncate',
                      isCovered ? 'text-zinc-300' : 'text-zinc-500'
                    )}>
                      {tactic?.label ?? tacticId}
                    </div>
                    {isCovered && modules[0] && (
                      <div className="text-[8px] text-zinc-600 truncate font-mono">
                        {modules[0]}{modules.length > 1 ? ` +${modules.length - 1}` : ''}
                      </div>
                    )}
                  </div>

                  {/* Add button for missing tactics */}
                  {!isCovered && onFilterTactic && (
                    <button
                      onClick={() => onFilterTactic(tacticId)}
                      title={`Filter library to ${tactic?.label}`}
                      className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-amber-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary footer */}
          {missing.length === 0 ? (
            <div className="text-[9px] text-green-400 font-mono text-center py-1 border border-green-500/20 rounded bg-green-500/5">
              ✓ ALL JQR REQUIREMENTS MET
            </div>
          ) : (
            <div className="text-[9px] text-amber-500/70 font-mono text-center">
              {missing.length} tactic{missing.length > 1 ? 's' : ''} remaining
            </div>
          )}
        </div>
      )}
    </div>
  );
}