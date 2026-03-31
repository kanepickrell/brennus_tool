import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Play,
  FileDown,
  RotateCcw,
  Save,
  FolderOpen,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react';
import { Node } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { JQRProfile, MITRE_TACTICS } from '@/types/campaign';
import { OpforNodeData } from '@/types/opfor';

export type ViewMode = 'canvas' | 'script';
export type LifecycleStage = 'draft' | 'review' | 'approved' | 'active' | 'archived';

// Custom smiley face icon component
const SmileyIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="-10 -10 520 480"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="50"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    <path d="M 88 8 L 408 8 L 488 88 L 488 368 L 408 448 L 88 448 L 8 368 L 8 88 Z" />
    <path d="M 108 158 Q 158 118 208 158" />
    <path d="M 298 158 L 378 118" />
    <path d="M 178 298 L 328 298" />
  </svg>
);

// ── JQR coverage hook ────────────────────────────────────────────────────────

function useTacticCoverage(nodes: Node[] | undefined): Record<string, string[]> {
  return useMemo(() => {
    const coverage: Record<string, string[]> = {};
    for (const node of (nodes ?? [])) {
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

// ── Inline JQR Tracker ───────────────────────────────────────────────────────

interface JQRTrackerProps {
  nodes?: Node[];
  jqrProfile: JQRProfile | null;
  onFilterTactic?: (tacticId: string) => void;
}

function JQRTracker({ nodes, jqrProfile, onFilterTactic }: JQRTrackerProps) {
  const [expanded, setExpanded] = useState(false);
  const coverage  = useTacticCoverage(nodes);

  // No profile state
  if (!jqrProfile || jqrProfile.requiredTactics.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2.5 h-7 border border-zinc-800 rounded-sm bg-zinc-900/50">
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 whitespace-nowrap">
          JQR
        </span>
        <div className="w-px h-3 bg-zinc-700 flex-shrink-0" />
        <span className="text-[9px] font-mono text-zinc-700 whitespace-nowrap">No profile loaded</span>
      </div>
    );
  }

  const required   = jqrProfile.requiredTactics;
  const covered    = required.filter(t => coverage[t]?.length > 0);
  const missing    = required.filter(t => !coverage[t]?.length);
  const pct        = required.length > 0 ? Math.round((covered.length / required.length) * 100) : 0;
  const isComplete = pct === 100;

  return (
    <div className="relative">
      {/* ── Collapsed trigger ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={cn(
          'flex items-center gap-2 px-2.5 h-7 border rounded-sm transition-colors',
          expanded
            ? 'bg-zinc-800 border-zinc-700'
            : 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700'
        )}
      >
        {/* Label */}
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 whitespace-nowrap">
          JQR
        </span>

        <div className="w-px h-3 bg-zinc-700 flex-shrink-0" />

        {/* Tactic dot heatmap */}
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
                  isReq ? 'w-2 h-2' : 'w-1.5 h-1.5 opacity-25',
                  isCov && isReq  ? 'bg-green-500' :
                  !isCov && isReq ? 'bg-amber-500/80' :
                  isCov           ? 'bg-zinc-500' :
                                    'bg-zinc-800'
                )}
              />
            );
          })}
        </div>

        <div className="w-px h-3 bg-zinc-700 flex-shrink-0" />

        {/* Fraction */}
        <span className={cn(
          'text-[9px] font-bold font-mono tabular-nums whitespace-nowrap',
          isComplete ? 'text-green-400' : pct > 50 ? 'text-amber-400' : 'text-zinc-500'
        )}>
          {covered.length}/{required.length}
        </span>

        {/* Mini progress bar */}
        <div className="w-10 h-1 bg-zinc-800 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isComplete ? 'bg-green-500' : pct > 50 ? 'bg-amber-500' : 'bg-zinc-600'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {expanded
          ? <ChevronUp className="h-3 w-3 text-zinc-600 flex-shrink-0" />
          : <ChevronDown className="h-3 w-3 text-zinc-600 flex-shrink-0" />
        }
      </button>

      {/* ── Expanded dropdown (floats below toolbar) ── */}
      {expanded && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl shadow-black/60 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/80">
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
              JQR: {jqrProfile.name.replace('318 RANS ', '')}
            </span>
            <span className={cn(
              'text-[9px] font-bold font-mono',
              isComplete ? 'text-green-400' : 'text-amber-400'
            )}>
              {pct}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="px-3 pt-2.5 pb-1">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isComplete ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-zinc-600'
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Tactic checklist */}
          <div className="px-3 pb-3 pt-1 space-y-0.5 max-h-64 overflow-y-auto">
            {required.map(tacticId => {
              const tactic     = MITRE_TACTICS.find(t => t.id === tacticId);
              const modules    = coverage[tacticId] ?? [];
              const isCovered  = modules.length > 0;
              return (
                <div
                  key={tacticId}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1 rounded transition-colors',
                    isCovered ? 'bg-green-500/5' : 'bg-amber-500/5'
                  )}
                >
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-sm flex items-center justify-center flex-shrink-0 text-[8px]',
                    isCovered ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-500'
                  )}>
                    {isCovered ? '✓' : '✗'}
                  </div>
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
                  {!isCovered && onFilterTactic && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onFilterTactic(tacticId); setExpanded(false); }}
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

          {/* Footer */}
          <div className={cn(
            'px-3 py-2 border-t border-zinc-800/80 text-center',
            isComplete ? 'bg-green-500/5' : ''
          )}>
            {missing.length === 0 ? (
              <span className="text-[9px] text-green-400 font-mono">✓ ALL JQR REQUIREMENTS MET</span>
            ) : (
              <span className="text-[9px] text-amber-500/70 font-mono">
                {missing.length} tactic{missing.length > 1 ? 's' : ''} remaining
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

export interface ToolbarProps {
  viewMode: ViewMode;
  lifecycleStage: LifecycleStage;
  onViewModeChange: (mode: ViewMode) => void;
  onLifecycleChange: (stage: LifecycleStage) => void;
  onValidate: () => void;
  onSimulate: () => void;
  onExport: () => void;
  onReset: () => void;
  onSave: () => void;
  onLoad: () => void;
  // JQR tracker props (replaces zoom controls)
  nodes?: Node[];
  jqrProfile: JQRProfile | null;
  onFilterTactic?: (tacticId: string) => void;
}

export function Toolbar({
  viewMode,
  lifecycleStage,
  onViewModeChange,
  onLifecycleChange,
  onValidate,
  onSimulate,
  onExport,
  onReset,
  onSave,
  onLoad,
  nodes,
  jqrProfile,
  onFilterTactic,
}: ToolbarProps) {
  return (
    <div className="h-14 border-b border-panel-border bg-panel flex items-center justify-between px-4 gap-4">
      {/* Left Section: View Mode Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">View</span>
          <div className="relative flex items-center bg-zinc-900/80 border border-zinc-800 rounded-sm p-0.5">
            <div
              className={cn(
                "absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/50 rounded-sm transition-all duration-200 ease-out",
                viewMode === 'canvas' ? 'left-0.5' : 'left-[calc(50%+1px)]'
              )}
            />
            <button
              onClick={() => onViewModeChange('canvas')}
              className={cn(
                "relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors duration-200",
                viewMode === 'canvas' ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Canvas
            </button>
            <button
              onClick={() => onViewModeChange('script')}
              className={cn(
                "relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors duration-200",
                viewMode === 'script' ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <SmileyIcon className="h-3.5 w-3.5" />
              Code
            </button>
          </div>
        </div>
        <div className="h-6 w-px bg-zinc-800" />
      </div>

      {/* Center Section: Main Actions */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSave}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onLoad}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Load
        </Button>

        <div className="h-5 w-px bg-zinc-800 mx-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onValidate}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Validate
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onSimulate}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"
        >
          <Play className="h-3.5 w-3.5" />
          Execute
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onExport}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10"
        >
          <FileDown className="h-3.5 w-3.5" />
          Export
        </Button>

        <div className="h-5 w-px bg-zinc-800 mx-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
      </div>

      {/* Right Section: JQR Tracker (replaces zoom controls) */}
      <JQRTracker
        nodes={nodes}
        jqrProfile={jqrProfile}
        onFilterTactic={onFilterTactic}
      />
    </div>
  );
}