// src/components/workflow/CampaignStatusBar.tsx
//
// Replaces the verbose JQRPanel in the right rail with two compact widgets:
//
// 1. LIFECYCLE STRIP — shows Draft → Validated → Executed → Published
//    as a horizontal pipeline. Current stage glows. Clicking a stage
//    that is reachable advances the lifecycle (gated by WorkflowBuilder).
//
// 2. JQR COVERAGE PILL — a condensed row of colored tactic dots with a
//    coverage percentage. Hover expands a full tactic breakdown panel.
//    Replaces the always-visible JQRPanel to reclaim vertical space for
//    the properties panel below.

import { useState, useRef, useEffect } from 'react';
import { Node } from '@xyflow/react';
import { Check, ChevronRight, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OpforNodeData } from '@/types/opfor';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LifecycleStage = 'draft' | 'validated' | 'executed' | 'published';

interface JqrProfile {
  requiredTactics?: string[];
  [key: string]: unknown;
}

interface Props {
  lifecycleStage: LifecycleStage;
  onLifecycleChange: (stage: LifecycleStage) => void;
  nodes: Node[];
  jqrProfile: JqrProfile | null;
  onFilterTactic: (tacticId: string) => void;
  onPublish?: () => void;   // fires the ProtoGraph sync when published
  taggedGroupCount?: number; // how many operator groups are 'ready'
}

// ── Lifecycle config ──────────────────────────────────────────────────────────

const STAGES: {
  id: LifecycleStage;
  label: string;
  shortLabel: string;
  color: string;
  activeColor: string;
  doneColor: string;
}[] = [
  {
    id: 'draft',
    label: 'Draft',
    shortLabel: 'DRAFT',
    color: 'text-zinc-500',
    activeColor: 'text-zinc-200 border-zinc-400',
    doneColor: 'text-zinc-400 border-zinc-600',
  },
  {
    id: 'validated',
    label: 'Validated',
    shortLabel: 'VALID',
    color: 'text-zinc-500',
    activeColor: 'text-blue-300 border-blue-400',
    doneColor: 'text-blue-400/60 border-blue-600/40',
  },
  {
    id: 'executed',
    label: 'Executed',
    shortLabel: 'EXEC',
    color: 'text-zinc-500',
    activeColor: 'text-green-300 border-green-400',
    doneColor: 'text-green-400/60 border-green-600/40',
  },
  {
    id: 'published',
    label: 'Published',
    shortLabel: 'PUB',
    color: 'text-zinc-500',
    activeColor: 'text-amber-300 border-amber-400',
    doneColor: 'text-amber-400/60 border-amber-600/40',
  },
];

const STAGE_ORDER: LifecycleStage[] = ['draft', 'validated', 'executed', 'published'];

// ── Tactic color map for JQR dots ─────────────────────────────────────────────

const TACTIC_DOT: Record<string, { dot: string; label: string }> = {
  'TA0042': { dot: 'bg-teal-400',   label: 'Resource Dev'      },
  'TA0043': { dot: 'bg-sky-400',    label: 'Recon'             },
  'TA0001': { dot: 'bg-blue-400',   label: 'Initial Access'    },
  'TA0002': { dot: 'bg-orange-400', label: 'Execution'         },
  'TA0003': { dot: 'bg-purple-400', label: 'Persistence'       },
  'TA0004': { dot: 'bg-pink-400',   label: 'Priv Escalation'   },
  'TA0005': { dot: 'bg-indigo-400', label: 'Defense Evasion'   },
  'TA0006': { dot: 'bg-red-400',    label: 'Cred Access'       },
  'TA0007': { dot: 'bg-green-400',  label: 'Discovery'         },
  'TA0008': { dot: 'bg-violet-400', label: 'Lateral Movement'  },
  'TA0009': { dot: 'bg-cyan-400',   label: 'Collection'        },
  'TA0011': { dot: 'bg-yellow-400', label: 'C2'                },
  'TA0010': { dot: 'bg-emerald-400',label: 'Exfiltration'      },
  'TA0040': { dot: 'bg-rose-400',   label: 'Impact'            },
  'control': { dot: 'bg-zinc-400',  label: 'Control'           },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CampaignStatusBar({
  lifecycleStage,
  onLifecycleChange,
  nodes,
  jqrProfile,
  onFilterTactic,
  onPublish,
  taggedGroupCount = 0,
}: Props) {
  const [jqrExpanded, setJqrExpanded] = useState(false);
  const jqrRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close JQR panel on outside click
  useEffect(() => {
    if (!jqrExpanded) return;
    const handler = (e: MouseEvent) => {
      if (jqrRef.current && !jqrRef.current.contains(e.target as Node)) {
        setJqrExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [jqrExpanded]);

  // ── Derived tactic coverage ───────────────────────────────────────────────

  const tacticsCovered = new Set(
    nodes
      .map(n => (n.data as OpforNodeData).definition?.tactic)
      .filter(Boolean) as string[]
  );

  const requiredTactics = jqrProfile?.requiredTactics ?? [];
  const coveredRequired = requiredTactics.filter(t => tacticsCovered.has(t));
  const coveragePct = requiredTactics.length > 0
    ? Math.round((coveredRequired.length / requiredTactics.length) * 100)
    : 0;

  // All unique tactics on canvas (for dot display)
  const canvasTactics = [...tacticsCovered];

  // ── Lifecycle helpers ─────────────────────────────────────────────────────

  const currentIdx = STAGE_ORDER.indexOf(lifecycleStage);

  const isPublishReady = lifecycleStage === 'executed' && taggedGroupCount > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-0 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">

      {/* ── Lifecycle pipeline strip ── */}
      <div className="flex items-center px-3 py-2 gap-1">
        {STAGES.map((stage, i) => {
          const idx    = STAGE_ORDER.indexOf(stage.id);
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          const isNext = idx === currentIdx + 1;
          const isPublish = stage.id === 'published';

          return (
            <div key={stage.id} className="flex items-center gap-1 flex-1 min-w-0">
              {/* Stage pill */}
              <button
                onClick={() => {
                  if (isPublish && isPublishReady) {
                    onLifecycleChange('published');
                    onPublish?.();
                  } else if (isNext || isDone) {
                    onLifecycleChange(stage.id);
                  }
                }}
                disabled={!isDone && !isActive && !isNext && !(isPublish && isPublishReady)}
                className={cn(
                  'flex-1 min-w-0 flex items-center justify-center gap-1 py-1 px-1.5 rounded border text-[8px] font-mono font-bold uppercase tracking-wider transition-all duration-200',
                  isActive && stage.activeColor + ' bg-zinc-800/60',
                  isDone  && stage.doneColor + ' bg-transparent opacity-70',
                  !isDone && !isActive && 'text-zinc-700 border-zinc-800 cursor-default',
                  isNext  && 'text-zinc-400 border-zinc-700 hover:border-zinc-500 cursor-pointer',
                  isPublish && isPublishReady && !isActive && 'text-amber-400/80 border-amber-500/40 hover:border-amber-400/60 cursor-pointer animate-pulse',
                )}
                title={
                  isPublish
                    ? isPublishReady
                      ? `Publish — sync ${taggedGroupCount} tagged variation${taggedGroupCount !== 1 ? 's' : ''} to ProtoGraph`
                      : 'Execute first, then mark variations ready to publish'
                    : isNext ? `Advance to ${stage.label}` : stage.label
                }
              >
                {isDone ? (
                  <Check className="h-2 w-2 flex-shrink-0" />
                ) : isPublish && !isActive ? (
                  <Send className="h-2 w-2 flex-shrink-0 opacity-60" />
                ) : null}
                <span className="truncate">{stage.shortLabel}</span>
              </button>

              {/* Connector arrow between stages */}
              {i < STAGES.length - 1 && (
                <ChevronRight className={cn(
                  'h-2.5 w-2.5 flex-shrink-0',
                  idx < currentIdx ? 'text-zinc-600' : 'text-zinc-800',
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── JQR coverage pill — hover to expand ── */}
      <div
        ref={jqrRef}
        className="relative px-3 pb-2"
        onMouseEnter={() => {
          hoverTimerRef.current = setTimeout(() => setJqrExpanded(true), 300);
        }}
        onMouseLeave={() => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          // Don't auto-close on leave — user clicked to keep it open
        }}
      >
        {/* Condensed pill */}
        <button
          onClick={() => setJqrExpanded(o => !o)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700/60 transition-colors"
        >
          {/* Coverage bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider">
                {jqrProfile ? 'JQR Coverage' : 'Tactics'}
              </span>
              <span className={cn(
                'text-[8px] font-mono font-bold',
                coveragePct >= 80 ? 'text-green-400' :
                coveragePct >= 50 ? 'text-amber-400' : 'text-zinc-400',
              )}>
                {jqrProfile ? `${coveragePct}%` : `${canvasTactics.length} tactics`}
              </span>
            </div>
            {/* Tactic dots row */}
            <div className="flex items-center gap-1 flex-wrap">
              {canvasTactics.slice(0, 12).map(t => {
                const cfg = TACTIC_DOT[t] ?? TACTIC_DOT['control'];
                const isRequired = requiredTactics.includes(t);
                const isCovered  = isRequired && tacticsCovered.has(t);
                return (
                  <div
                    key={t}
                    className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      cfg.dot,
                      !isCovered && isRequired && 'opacity-30',
                      !isRequired && 'opacity-60',
                    )}
                    title={cfg.label}
                  />
                );
              })}
              {canvasTactics.length > 12 && (
                <span className="text-[7px] text-zinc-600 font-mono">+{canvasTactics.length - 12}</span>
              )}
              {canvasTactics.length === 0 && (
                <span className="text-[8px] text-zinc-700 font-mono">No tactics on canvas</span>
              )}
            </div>
          </div>
        </button>

        {/* Expanded panel — floats above, anchored to the pill */}
        {jqrExpanded && (
          <div className="absolute right-3 top-full mt-1 z-50 w-64 rounded-xl bg-zinc-900 border border-zinc-700/60 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
              <span className="text-[9px] font-mono font-bold text-zinc-300 uppercase tracking-widest">
                {jqrProfile ? 'JQR Tracker' : 'Tactic Coverage'}
              </span>
              {jqrProfile && (
                <span className={cn(
                  'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded',
                  coveragePct >= 80 ? 'text-green-400 bg-green-400/10' :
                  coveragePct >= 50 ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-400 bg-zinc-800',
                )}>
                  {coveragePct}%
                </span>
              )}
            </div>

            {/* Coverage progress bar */}
            {jqrProfile && (
              <div className="px-3 py-2 border-b border-zinc-800/60">
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      coveragePct >= 80 ? 'bg-green-400' :
                      coveragePct >= 50 ? 'bg-amber-400' : 'bg-zinc-500',
                    )}
                    style={{ width: `${coveragePct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[8px] text-zinc-600 font-mono">
                    {coveredRequired.length}/{requiredTactics.length} required
                  </span>
                  <span className="text-[8px] text-zinc-600 font-mono">
                    {canvasTactics.length} total
                  </span>
                </div>
              </div>
            )}

            {/* Tactic list */}
            <div className="max-h-56 overflow-y-auto py-1">
              {(requiredTactics.length > 0 ? requiredTactics : canvasTactics).map(tacticId => {
                const cfg      = TACTIC_DOT[tacticId] ?? TACTIC_DOT['control'];
                const covered  = tacticsCovered.has(tacticId);
                const required = requiredTactics.includes(tacticId);

                return (
                  <button
                    key={tacticId}
                    onClick={() => { onFilterTactic(tacticId); setJqrExpanded(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      cfg.dot,
                      !covered && 'opacity-25',
                    )} />
                    <span className={cn(
                      'flex-1 text-[9px] font-mono truncate',
                      covered ? 'text-zinc-300' : 'text-zinc-600',
                    )}>
                      {cfg.label}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {required && (
                        <span className="text-[7px] font-mono text-zinc-600 uppercase">req</span>
                      )}
                      {covered ? (
                        <Check className="h-2.5 w-2.5 text-green-400" />
                      ) : (
                        <span className="text-[8px] text-zinc-700">+</span>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Uncovered required tactics */}
              {requiredTactics
                .filter(t => !tacticsCovered.has(t))
                .map(tacticId => {
                  const cfg = TACTIC_DOT[tacticId] ?? TACTIC_DOT['control'];
                  return (
                    <button
                      key={`missing-${tacticId}`}
                      onClick={() => { onFilterTactic(tacticId); setJqrExpanded(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-zinc-800/50 transition-colors text-left"
                    >
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0 opacity-20', cfg.dot)} />
                      <span className="flex-1 text-[9px] font-mono text-zinc-700 truncate">
                        {cfg.label}
                      </span>
                      <span className="text-[7px] font-mono text-zinc-700 uppercase flex-shrink-0">missing</span>
                    </button>
                  );
                })}
            </div>

            {/* Publish CTA — shown when ready */}
            {isPublishReady && (
              <div className="px-3 py-2 border-t border-zinc-800 bg-amber-400/5">
                <div className="text-[8px] text-amber-400/70 font-mono mb-1.5">
                  {taggedGroupCount} variation{taggedGroupCount !== 1 ? 's' : ''} ready to publish
                </div>
                <button
                  onClick={() => {
                    onLifecycleChange('published');
                    onPublish?.();
                    setJqrExpanded(false);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[9px] font-mono font-bold text-zinc-900 bg-amber-400 hover:bg-amber-300 transition-colors"
                >
                  <Send className="h-2.5 w-2.5" />
                  Publish to ProtoGraph
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}