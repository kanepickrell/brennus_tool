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

import { Node } from '@xyflow/react';
import { Check, ChevronRight, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LifecycleStage = 'draft' | 'validated' | 'executed' | 'published';

interface Props {
  lifecycleStage: LifecycleStage;
  onLifecycleChange: (stage: LifecycleStage) => void;
  nodes?: Node[];
  onPublish?: () => void;
  taggedGroupCount?: number;
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

// ── Component ─────────────────────────────────────────────────────────────────

export function CampaignStatusBar({
  lifecycleStage,
  onLifecycleChange,
  onPublish,
  taggedGroupCount = 0,
}: Props) {
  const currentIdx = STAGE_ORDER.indexOf(lifecycleStage);
  const isPublishReady = lifecycleStage === 'executed' && taggedGroupCount > 0;

  return (
    <div className="flex flex-col gap-0 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">

      {/* ── Lifecycle pipeline strip ── */}
      <div className="flex items-center px-3 py-2 gap-1">
        {STAGES.map((stage, i) => {
          const idx      = STAGE_ORDER.indexOf(stage.id);
          const isDone   = idx < currentIdx;
          const isActive = idx === currentIdx;
          const isNext   = idx === currentIdx + 1;
          const isPublish = stage.id === 'published';

          return (
            <div key={stage.id} className="flex items-center gap-1 flex-1 min-w-0">
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
                  isDone   && stage.doneColor   + ' bg-transparent opacity-70',
                  !isDone && !isActive && 'text-zinc-700 border-zinc-800 cursor-default',
                  isNext   && 'text-zinc-400 border-zinc-700 hover:border-zinc-500 cursor-pointer',
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
    </div>
  );
}