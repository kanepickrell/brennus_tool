// src/components/workflow/CampaignBar.tsx
// Persistent campaign-level bar: phase · JQR tactic strip · coverage % · mode toggle
// Replaces the standalone JQRPanel — always visible, no panel cost.

import { useState } from 'react';
import { Node } from '@xyflow/react';
import { ChevronDown, ChevronUp, Compass, List } from 'lucide-react';
import { JQRProfile, MITRE_TACTICS } from '@/types/campaign';
import { OpforNodeData } from '@/types/opfor';
import { cn } from '@/lib/utils';

export type LibraryMode = 'browse' | 'guided';

export type CampaignPhase =
  | 'setup'
  | 'initial-access'
  | 'persistence'
  | 'execution'
  | 'exfiltration'
  | 'complete';

const PHASE_LABELS: Record<CampaignPhase, string> = {
  'setup':          'Setup',
  'initial-access': 'Initial access',
  'persistence':    'Persistence',
  'execution':      'Execution',
  'exfiltration':   'Exfiltration',
  'complete':       'Complete',
};

const PHASE_COLORS: Record<CampaignPhase, string> = {
  'setup':          'text-zinc-400 border-zinc-700 bg-zinc-900',
  'initial-access': 'text-blue-400 border-blue-800 bg-blue-950/60',
  'persistence':    'text-purple-400 border-purple-800 bg-purple-950/60',
  'execution':      'text-orange-400 border-orange-800 bg-orange-950/60',
  'exfiltration':   'text-emerald-400 border-emerald-800 bg-emerald-950/60',
  'complete':       'text-green-400 border-green-800 bg-green-950/60',
};

interface CampaignBarProps {
  nodes: Node[];
  jqrProfile: JQRProfile | null;
  libraryMode: LibraryMode;
  onLibraryModeChange: (mode: LibraryMode) => void;
  currentPhase?: CampaignPhase;
}

function useTacticCoverage(nodes: Node[]): Record<string, string[]> {
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
}

export function CampaignBar({
  nodes,
  jqrProfile,
  libraryMode,
  onLibraryModeChange,
  currentPhase = 'setup',
}: CampaignBarProps) {
  const [expanded, setExpanded] = useState(false);
  const coverage  = useTacticCoverage(nodes);
  const required  = jqrProfile?.requiredTactics ?? [];
  const covered   = required.filter(t => coverage[t]?.length > 0);
  const pct       = required.length > 0 ? Math.round((covered.length / required.length) * 100) : 0;
  const isComplete = pct === 100;

  return (
    <div className="flex-shrink-0 border-b border-zinc-800 bg-zinc-950">

      {/* ── Collapsed bar — always visible ── */}
      <div className="flex items-center gap-3 px-4 h-9">

        {/* Phase pill */}
        <span className={cn(
          'text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border',
          PHASE_COLORS[currentPhase]
        )}>
          {PHASE_LABELS[currentPhase]}
        </span>

        <div className="w-px h-4 bg-zinc-800 flex-shrink-0" />

        {/* Tactic heatmap — compact dot row */}
        {jqrProfile && required.length > 0 ? (
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-2 group"
            title="Toggle JQR coverage detail"
          >
            <div className="flex gap-0.5 items-center">
              {MITRE_TACTICS.map(t => {
                const isReq = required.includes(t.id);
                const isCov = !!coverage[t.id]?.length;
                return (
                  <div
                    key={t.id}
                    title={`${t.label}${isReq ? ' (required)' : ''}`}
                    className={cn(
                      'rounded-sm transition-all duration-300',
                      isReq ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5 opacity-30',
                      isCov && isReq  ? 'bg-green-500' :
                      !isCov && isReq ? 'bg-amber-500/80' :
                      isCov           ? 'bg-zinc-500' :
                                        'bg-zinc-800'
                    )}
                  />
                );
              })}
            </div>

            {/* Coverage fraction */}
            <span className={cn(
              'text-[10px] font-bold font-mono tabular-nums',
              isComplete ? 'text-green-400' : pct > 50 ? 'text-amber-400' : 'text-zinc-500'
            )}>
              {covered.length}/{required.length}
            </span>

            {/* Progress bar */}
            <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isComplete ? 'bg-green-500' : pct > 50 ? 'bg-amber-500' : 'bg-zinc-600'
                )}
                style={{ width: `${pct}%` }}
              />
            </div>

            <span className={cn(
              'text-[9px] font-mono',
              isComplete ? 'text-green-400' : 'text-zinc-600'
            )}>
              {isComplete ? '✓ complete' : `${pct}%`}
            </span>

            {expanded
              ? <ChevronUp className="h-3 w-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              : <ChevronDown className="h-3 w-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            }
          </button>
        ) : (
          <span className="text-[10px] text-zinc-600 font-mono">No JQR profile</span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded p-0.5">
          <button
            onClick={() => onLibraryModeChange('browse')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all duration-150',
              libraryMode === 'browse'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <List className="h-3 w-3" />
            Browse
          </button>
          <button
            onClick={() => onLibraryModeChange('guided')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all duration-150',
              libraryMode === 'guided'
                ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50'
                : 'text-zinc-500 hover:text-cyan-400'
            )}
          >
            <Compass className="h-3 w-3" />
            Guided
          </button>
        </div>
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && jqrProfile && required.length > 0 && (
        <div className="border-t border-zinc-800/60 px-4 py-3">
          <div className="flex gap-2 flex-wrap">
            {required.map(tacticId => {
              const tactic   = MITRE_TACTICS.find(t => t.id === tacticId);
              const modules  = coverage[tacticId] ?? [];
              const isCov    = modules.length > 0;
              return (
                <div
                  key={tacticId}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-mono',
                    isCov
                      ? 'bg-green-950/40 border-green-800/50 text-green-400'
                      : 'bg-amber-950/30 border-amber-800/40 text-amber-500'
                  )}
                >
                  <span>{isCov ? '✓' : '○'}</span>
                  <span>{tactic?.label ?? tacticId}</span>
                  {isCov && modules[0] && (
                    <span className="text-zinc-500 hidden xl:inline">
                      — {modules[0]}{modules.length > 1 ? ` +${modules.length - 1}` : ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {isComplete && (
            <p className="text-[9px] text-green-400 font-mono mt-2">
              ✓ All JQR requirements satisfied
            </p>
          )}
        </div>
      )}
    </div>
  );
}