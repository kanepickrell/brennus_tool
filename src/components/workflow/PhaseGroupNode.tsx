// src/components/workflow/PhaseGroupNode.tsx
//
// EXPANDED  — transparent container; child opforNodes live inside via parentId.
//             Header shows phase, variation name, step count, collapse button.
//
// COLLAPSED — compact pill with a card-stack effect. Two ghost divs sit behind
//             the main pill, offset diagonally, so the group reads as "there
//             are steps packed inside here." No handles, no inter-group edges —
//             proximity + stack depth conveys sequencing without routing lines.
//
// SEQUENCE  — WorkflowBuilder places a small ArrowConnector node between swim
//             lanes. Keeping it as a separate node (not an edge) avoids all
//             handle-position bugs on resize/collapse.
//
// FUTURE    — data.source = 'operator' flags user-drawn groups for ProtoGraph
//             TTP tagging. The TAGGED badge is already wired below.

import { memo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaggedGroupHeader, Difficulty, ContributionStatus, TaggedGroupPatch } from './TaggedGroupHeader';

// ── Tactic color map ─────────────────────────────────────────────────────────

const TACTIC_COLORS: Record<string, {
  border: string; borderHex: string;
  bg: string;     bgHex: string;
  text: string;   dot: string;
}> = {
  'TA0042': { border: 'border-teal-500/40',   borderHex: 'rgba(20,184,166,0.35)',  bg: 'bg-teal-500/8',   bgHex: 'rgba(20,184,166,0.08)',  text: 'text-teal-400',   dot: 'bg-teal-400'   },
  'TA0001': { border: 'border-blue-500/40',   borderHex: 'rgba(59,130,246,0.35)',  bg: 'bg-blue-500/8',   bgHex: 'rgba(59,130,246,0.08)',  text: 'text-blue-400',   dot: 'bg-blue-400'   },
  'TA0002': { border: 'border-orange-500/40', borderHex: 'rgba(249,115,22,0.35)', bg: 'bg-orange-500/8', bgHex: 'rgba(249,115,22,0.08)', text: 'text-orange-400', dot: 'bg-orange-400' },
  'TA0003': { border: 'border-purple-500/40', borderHex: 'rgba(168,85,247,0.35)', bg: 'bg-purple-500/8', bgHex: 'rgba(168,85,247,0.08)', text: 'text-purple-400', dot: 'bg-purple-400' },
  'TA0004': { border: 'border-pink-500/40',   borderHex: 'rgba(236,72,153,0.35)', bg: 'bg-pink-500/8',   bgHex: 'rgba(236,72,153,0.08)', text: 'text-pink-400',   dot: 'bg-pink-400'   },
  'TA0005': { border: 'border-indigo-500/40', borderHex: 'rgba(99,102,241,0.35)', bg: 'bg-indigo-500/8', bgHex: 'rgba(99,102,241,0.08)', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  'TA0006': { border: 'border-red-500/40',    borderHex: 'rgba(239,68,68,0.35)',  bg: 'bg-red-500/8',    bgHex: 'rgba(239,68,68,0.08)',  text: 'text-red-400',    dot: 'bg-red-400'    },
  'TA0007': { border: 'border-green-500/40',  borderHex: 'rgba(34,197,94,0.35)',  bg: 'bg-green-500/8',  bgHex: 'rgba(34,197,94,0.08)',  text: 'text-green-400',  dot: 'bg-green-400'  },
  'TA0008': { border: 'border-violet-500/40', borderHex: 'rgba(139,92,246,0.35)', bg: 'bg-violet-500/8', bgHex: 'rgba(139,92,246,0.08)', text: 'text-violet-400', dot: 'bg-violet-400' },
  'TA0009': { border: 'border-cyan-500/40',   borderHex: 'rgba(6,182,212,0.35)',  bg: 'bg-cyan-500/8',   bgHex: 'rgba(6,182,212,0.08)',  text: 'text-cyan-400',   dot: 'bg-cyan-400'   },
  'TA0011': { border: 'border-yellow-500/40', borderHex: 'rgba(234,179,8,0.35)',  bg: 'bg-yellow-500/8', bgHex: 'rgba(234,179,8,0.08)',  text: 'text-yellow-400', dot: 'bg-yellow-400' },
  'control': { border: 'border-zinc-500/40',  borderHex: 'rgba(113,113,122,0.35)',bg: 'bg-zinc-500/8',   bgHex: 'rgba(113,113,122,0.08)',text: 'text-zinc-400',   dot: 'bg-zinc-400'   },
};

// ── Data shape ───────────────────────────────────────────────────────────────

export interface PhaseGroupData {
  groupId: string;

  phaseLabel: string;
  phaseId: string;
  variationName: string;
  stepCount: number;
  childNodeIds: string[];

  collapsed: boolean;

  expandedWidth: number;
  expandedHeight: number;

  onToggleCollapse: (groupId: string) => void;

  source: 'guided' | 'operator';
  ttpTag?: string;
}

// ── Dimensions ───────────────────────────────────────────────────────────────

export const PILL_W                  = 200;
export const PILL_H                  = 56;
export const GROUP_HEADER_H          = 38;   // guided group header
export const OPERATOR_GROUP_HEADER_H = 68;   // operator header has 2 rows
export const GROUP_PADDING           = 28;   // padding around child nodes inside group

// Ghost card stack — each entry is one card peeking behind the pill
const GHOSTS = [
  { x: 5,  y: 4, opacity: 0.28 },
  { x: 10, y: 8, opacity: 0.13 },
];

// Total wrap size includes the furthest ghost offset so clicks register
const WRAP_W = PILL_W + GHOSTS[GHOSTS.length - 1].x;
const WRAP_H = PILL_H + GHOSTS[GHOSTS.length - 1].y;

// ── Component ────────────────────────────────────────────────────────────────

export const PhaseGroupNode = memo(({ data, selected }: {
  data: PhaseGroupData;
  selected?: boolean;
}) => {
  const colors = TACTIC_COLORS[data.phaseId] || TACTIC_COLORS['control'];

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    data.onToggleCollapse(data.groupId);
  }, [data]);

  // ── EXPANDED ─────────────────────────────────────────────────────────────

  if (!data.collapsed) {
    return (
      <div
        className={cn(
          'relative rounded-xl border transition-all duration-300',
          colors.border, colors.bg,
          selected && 'ring-2 ring-white/20 ring-offset-1 ring-offset-black',
        )}
        style={{
          width:     data.expandedWidth,
          height:    data.expandedHeight + GROUP_HEADER_H + GROUP_PADDING,
          minWidth:  200,
          minHeight: 80,
          overflow:  'visible',
        }}
      >
        {/* Header bar — operator-tagged groups get the full tag editor */}
        {data.source === 'operator' ? (
          <div className={cn('border-b', colors.border)}>
            <TaggedGroupHeader
              groupId={data.groupId}
              variationName={data.variationName}
              phaseLabel={data.phaseLabel}
              phaseId={data.phaseId}
              difficulty={data.difficulty ?? 'Standard'}
              ksaIds={data.ksaIds ?? []}
              jqsIds={data.jqsIds ?? []}
              narrative={data.narrative ?? ''}
              contributionStatus={data.contributionStatus ?? 'draft'}
              stepCount={data.stepCount}
              childTtpIds={data.childTtpIds ?? []}
              onUpdateTag={data.onUpdateTag ?? (() => {})}
              onToggleCollapse={data.onToggleCollapse}
              onPushToProtoGraph={data.onPushToProtoGraph}
            />
          </div>
        ) : (
          <div
            className={cn('flex items-center gap-2 px-3 border-b', colors.border)}
            style={{ height: GROUP_HEADER_H }}
          >
            <div className={cn('w-2 h-2 rounded-full flex-shrink-0', colors.dot)} />
            <div className="flex-1 min-w-0">
              <span className={cn('text-[10px] font-bold uppercase tracking-widest font-mono', colors.text)}>
                {data.phaseLabel}
              </span>
              <span className="text-[9px] text-zinc-500 truncate block leading-tight">
                {data.variationName} · {data.stepCount} steps
              </span>
            </div>
            <button
              onClick={handleToggle}
              className="flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
              title="Collapse phase"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ReactFlow places child nodes here automatically via parentId */}
      </div>
    );
  }

  // ── COLLAPSED — CARD STACK ────────────────────────────────────────────────

  return (
    <div
      style={{ width: WRAP_W, height: WRAP_H, position: 'relative', cursor: 'pointer' }}
      onClick={handleToggle}
      title="Click to expand"
    >
      {/* Ghost cards — drawn back-to-front */}
      {[...GHOSTS].reverse().map((g, i) => (
        <div
          key={i}
          className={cn('absolute rounded-xl border')}
          style={{
            left:        g.x,
            top:         g.y,
            width:       PILL_W,
            height:      PILL_H,
            background:  colors.bgHex,
            borderColor: colors.borderHex,
            opacity:     g.opacity,
            zIndex:      i,
          }}
        />
      ))}

      {/* Main pill */}
      <div
        className={cn(
          'absolute rounded-xl border transition-colors duration-150',
          colors.border, colors.bg,
          'hover:brightness-110',
          selected && 'ring-2 ring-white/20 ring-offset-1 ring-offset-black',
        )}
        style={{
          left:   0,
          top:    0,
          width:  PILL_W,
          height: PILL_H,
          zIndex: GHOSTS.length + 1,
        }}
      >
        <div className="flex items-center gap-2.5 h-full px-3">
          {/* Tactic dot */}
          <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', colors.dot)} />

          {/* Labels */}
          <div className="flex-1 min-w-0">
            <div className={cn('text-[10px] font-bold uppercase tracking-widest font-mono truncate', colors.text)}>
              {data.phaseLabel}
            </div>
            <div className="text-[9px] text-zinc-500 truncate leading-tight">
              {data.variationName}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Layers className="h-2.5 w-2.5 text-zinc-700" />
              <span className="text-[8px] text-zinc-600 font-mono">
                {data.stepCount} steps
              </span>
            </div>
          </div>

          <ChevronRight className={cn('h-3.5 w-3.5 flex-shrink-0 opacity-50', colors.text)} />
        </div>
      </div>
    </div>
  );
});

PhaseGroupNode.displayName = 'PhaseGroupNode';