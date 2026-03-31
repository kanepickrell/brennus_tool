// src/components/workflow/TaggedGroupHeader.tsx
//
// Inline tag editor rendered inside the header of an operator-drawn
// PhaseGroupNode (source = 'operator'). Replaces the simple phase label
// with editable fields — tactic picker, variation name, KSA/JQS multi-select,
// difficulty badge, and a contribution status indicator.
//
// All state changes call data.onUpdateTag(groupId, patch) which WorkflowBuilder
// merges into the node's data. No modal needed — everything is inline.

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Tag, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  KSA_REFERENCE, JQS_REFERENCE,
  suggestKsasForTtps, suggestJqsForTtps,
  PROVIDER_COLORS, TYPE_COLORS,
  KsaEntry, JqsEntry,
} from '@/data/ttpReferenceData';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Difficulty = 'Standard' | 'Advanced' | 'Complex';
export type ContributionStatus = 'draft' | 'ready' | 'synced';

export interface TaggedGroupPatch {
  variationName?: string;
  phaseLabel?: string;
  phaseId?: string;
  difficulty?: Difficulty;
  ksaIds?: string[];
  jqsIds?: string[];
  narrative?: string;
  contributionStatus?: ContributionStatus;
}

interface Props {
  groupId: string;
  variationName: string;
  phaseLabel: string;
  phaseId: string;
  difficulty: Difficulty;
  ksaIds: string[];
  jqsIds: string[];
  narrative: string;
  contributionStatus: ContributionStatus;
  stepCount: number;
  childTtpIds: string[];           // MITRE IDs from child nodes — used for auto-suggest
  onUpdateTag: (groupId: string, patch: TaggedGroupPatch) => void;
  onToggleCollapse: (groupId: string) => void;
  onPushToProtoGraph?: (groupId: string) => void;
}

// ── Tactic options ────────────────────────────────────────────────────────────

const TACTICS = [
  { id: 'TA0001', label: 'Initial Access',        color: 'text-blue-400'   },
  { id: 'TA0002', label: 'Execution',              color: 'text-orange-400' },
  { id: 'TA0003', label: 'Persistence',            color: 'text-purple-400' },
  { id: 'TA0004', label: 'Privilege Escalation',   color: 'text-pink-400'   },
  { id: 'TA0005', label: 'Defense Evasion',        color: 'text-indigo-400' },
  { id: 'TA0006', label: 'Credential Access',      color: 'text-red-400'    },
  { id: 'TA0007', label: 'Discovery',              color: 'text-green-400'  },
  { id: 'TA0008', label: 'Lateral Movement',       color: 'text-violet-400' },
  { id: 'TA0009', label: 'Collection',             color: 'text-cyan-400'   },
  { id: 'TA0011', label: 'Command & Control',      color: 'text-yellow-400' },
  { id: 'TA0010', label: 'Exfiltration',           color: 'text-teal-400'   },
  { id: 'TA0040', label: 'Impact',                 color: 'text-rose-400'   },
  { id: 'TA0042', label: 'Resource Development',   color: 'text-teal-400'   },
  { id: 'TA0043', label: 'Reconnaissance',         color: 'text-sky-400'    },
];

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  Standard: 'text-green-400 bg-green-400/10 border-green-400/30',
  Advanced:  'text-amber-400 bg-amber-400/10 border-amber-400/30',
  Complex:   'text-red-400   bg-red-400/10   border-red-400/30',
};

const STATUS_CONFIG: Record<ContributionStatus, { label: string; color: string }> = {
  draft:  { label: 'DRAFT',   color: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/30' },
  ready:  { label: 'READY',   color: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
  synced: { label: 'SYNCED',  color: 'text-green-400 bg-green-400/10 border-green-400/30' },
};

// ── Small reusable dropdown ───────────────────────────────────────────────────

function Dropdown({ label, children, className }: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current  && btnRef.current.contains(e.target as Node) ||
        menuRef.current && menuRef.current.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  };

  return (
    <div className={cn('relative', className)}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono bg-zinc-800/60 border border-zinc-700/50 hover:border-zinc-500/60 transition-colors"
      >
        {label}
        <ChevronDown className="h-2.5 w-2.5 opacity-50" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] min-w-[220px] max-h-[260px] overflow-y-auto rounded-lg bg-zinc-900 border border-zinc-700/60 shadow-2xl"
          style={{ top: pos.top, left: pos.left }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── KSA / JQS multi-select dropdown ──────────────────────────────────────────

function KsaJqsDropdown({ ksaIds, jqsIds, childTtpIds, onChange }: {
  ksaIds: string[];
  jqsIds: string[];
  childTtpIds: string[];
  onChange: (patch: { ksaIds?: string[]; jqsIds?: string[] }) => void;
}) {
  const [tab, setTab] = useState<'KSA' | 'JQS'>('KSA');
  const [search, setSearch] = useState('');

  const suggestedKsas = suggestKsasForTtps(childTtpIds).map(k => k.id);
  const suggestedJqss = suggestJqsForTtps(childTtpIds).map(j => j.id);

  const toggleKsa = (id: string) => {
    const next = ksaIds.includes(id) ? ksaIds.filter(x => x !== id) : [...ksaIds, id];
    onChange({ ksaIds: next });
  };
  const toggleJqs = (id: string) => {
    const next = jqsIds.includes(id) ? jqsIds.filter(x => x !== id) : [...jqsIds, id];
    onChange({ jqsIds: next });
  };

  const filteredKsas = KSA_REFERENCE.filter(k =>
    k.id.toLowerCase().includes(search.toLowerCase()) ||
    k.description.toLowerCase().includes(search.toLowerCase())
  );
  const filteredJqss = JQS_REFERENCE.filter(j =>
    j.id.toLowerCase().includes(search.toLowerCase()) ||
    j.description.toLowerCase().includes(search.toLowerCase())
  );

  const totalSelected = ksaIds.length + jqsIds.length;

  return (
    <Dropdown
      label={
        <span className={totalSelected > 0 ? 'text-amber-400' : 'text-zinc-400'}>
          {totalSelected > 0 ? `${totalSelected} KSA/JQS` : 'KSA / JQS'}
        </span>
      }
    >
      {/* Tab row */}
      <div className="flex border-b border-zinc-700/50">
        {(['KSA', 'JQS'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-1.5 text-[9px] font-mono font-bold transition-colors',
              tab === t ? 'text-amber-400 border-b border-amber-400' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {t} {t === 'KSA' ? `(${ksaIds.length})` : `(${jqsIds.length})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-1.5">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onClick={e => e.stopPropagation()}
          className="w-full bg-zinc-800 border border-zinc-700/50 rounded px-2 py-1 text-[9px] text-zinc-200 placeholder-zinc-600 outline-none"
        />
      </div>

      {/* Suggested banner */}
      {tab === 'KSA' && suggestedKsas.length > 0 && search === '' && (
        <div className="px-2 pb-1">
          <div className="text-[8px] text-amber-400/60 font-mono uppercase tracking-wider mb-1">Suggested for these TTPs</div>
          {filteredKsas.filter(k => suggestedKsas.includes(k.id)).map(k => (
            <KsaRow key={k.id} entry={k} selected={ksaIds.includes(k.id)} onToggle={toggleKsa} highlighted />
          ))}
          <div className="text-[8px] text-zinc-600 font-mono uppercase tracking-wider my-1">All KSAs</div>
        </div>
      )}
      {tab === 'JQS' && suggestedJqss.length > 0 && search === '' && (
        <div className="px-2 pb-1">
          <div className="text-[8px] text-amber-400/60 font-mono uppercase tracking-wider mb-1">Suggested for these TTPs</div>
          {filteredJqss.filter(j => suggestedJqss.includes(j.id)).map(j => (
            <JqsRow key={j.id} entry={j} selected={jqsIds.includes(j.id)} onToggle={toggleJqs} highlighted />
          ))}
          <div className="text-[8px] text-zinc-600 font-mono uppercase tracking-wider my-1">All JQS</div>
        </div>
      )}

      {/* List */}
      <div className="pb-1">
        {tab === 'KSA'
          ? filteredKsas
              .filter(k => search !== '' || !suggestedKsas.includes(k.id))
              .map(k => <KsaRow key={k.id} entry={k} selected={ksaIds.includes(k.id)} onToggle={toggleKsa} />)
          : filteredJqss
              .filter(j => search !== '' || !suggestedJqss.includes(j.id))
              .map(j => <JqsRow key={j.id} entry={j} selected={jqsIds.includes(j.id)} onToggle={toggleJqs} />)
        }
      </div>
    </Dropdown>
  );
}

function KsaRow({ entry, selected, onToggle, highlighted }: {
  entry: KsaEntry; selected: boolean; onToggle: (id: string) => void; highlighted?: boolean;
}) {
  return (
    <button
      onClick={() => onToggle(entry.id)}
      className={cn(
        'w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-zinc-800/60 transition-colors',
        highlighted && 'bg-amber-400/5',
      )}
    >
      <div className={cn(
        'w-3.5 h-3.5 mt-0.5 rounded flex-shrink-0 border flex items-center justify-center',
        selected ? 'bg-amber-400 border-amber-400' : 'border-zinc-600',
      )}>
        {selected && <Check className="h-2 w-2 text-zinc-900" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('text-[9px] font-mono font-bold', TYPE_COLORS[entry.type])}>
            {entry.id}
          </span>
          <span className={cn(
            'text-[7px] font-mono px-1 py-0.5 rounded border',
            PROVIDER_COLORS[entry.provider],
          )}>
            {entry.provider}
          </span>
        </div>
        <div className="text-[8px] text-zinc-400 leading-tight mt-0.5 line-clamp-2">
          {entry.description}
        </div>
      </div>
    </button>
  );
}

function JqsRow({ entry, selected, onToggle, highlighted }: {
  entry: JqsEntry; selected: boolean; onToggle: (id: string) => void; highlighted?: boolean;
}) {
  return (
    <button
      onClick={() => onToggle(entry.id)}
      className={cn(
        'w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-zinc-800/60 transition-colors',
        highlighted && 'bg-amber-400/5',
      )}
    >
      <div className={cn(
        'w-3.5 h-3.5 mt-0.5 rounded flex-shrink-0 border flex items-center justify-center',
        selected ? 'bg-amber-400 border-amber-400' : 'border-zinc-600',
      )}>
        {selected && <Check className="h-2 w-2 text-zinc-900" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono font-bold text-amber-400">{entry.id}</span>
          <span className="text-[7px] text-zinc-500 font-mono">{entry.module}</span>
          <span className={cn(
            'text-[7px] font-mono px-1 py-0.5 rounded border',
            PROVIDER_COLORS[entry.provider],
          )}>
            {entry.provider}
          </span>
        </div>
        <div className="text-[8px] text-zinc-400 leading-tight mt-0.5 line-clamp-2">
          {entry.description}
        </div>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TaggedGroupHeader({
  groupId, variationName, phaseLabel, phaseId, difficulty,
  ksaIds, jqsIds, narrative, contributionStatus, stepCount,
  childTtpIds, onUpdateTag, onToggleCollapse, onPushToProtoGraph,
}: Props) {
  const tactic = TACTICS.find(t => t.id === phaseId) ?? TACTICS[0];
  const status = STATUS_CONFIG[contributionStatus];

  const update = useCallback((patch: TaggedGroupPatch) => {
    onUpdateTag(groupId, patch);
  }, [groupId, onUpdateTag]);

  return (
    <div className="flex flex-col gap-0" style={{ minWidth: 0 }}>
      {/* ── Row 1: identity + controls ── */}
      <div className="flex items-center gap-2 px-3" style={{ height: 38 }}>
        {/* Amber tag icon — marks as operator-authored */}
        <Tag className="h-3 w-3 text-amber-400 flex-shrink-0" />

        {/* Editable variation name */}
        <input
          type="text"
          value={variationName}
          onChange={e => update({ variationName: e.target.value })}
          onClick={e => e.stopPropagation()}
          placeholder="Name this variation..."
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[10px] font-mono font-bold text-zinc-100 placeholder-zinc-600 truncate"
          style={{ caretColor: 'rgb(251,191,36)' }}
        />

        {/* Step count */}
        <span className="text-[8px] font-mono text-zinc-600 flex-shrink-0">
          {stepCount} steps
        </span>

        {/* Contribution status badge */}
        <span className={cn(
          'text-[7px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0',
          status.color,
        )}>
          {status.label}
        </span>

        {/* Push to ProtoGraph — only shown when ready */}
        {contributionStatus === 'ready' && onPushToProtoGraph && (
          <button
            onClick={e => { e.stopPropagation(); onPushToProtoGraph(groupId); }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono text-green-400 bg-green-400/10 border border-green-400/30 hover:bg-green-400/20 transition-colors flex-shrink-0"
            title="Push to ProtoGraph"
          >
            <Upload className="h-2.5 w-2.5" />
            Push
          </button>
        )}

        {/* Collapse */}
        <button
          onClick={e => { e.stopPropagation(); onToggleCollapse(groupId); }}
          className="flex items-center justify-center w-5 h-5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors flex-shrink-0"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* ── Row 2: tactic + difficulty + KSA/JQS pickers ── */}
      <div
        className="flex items-center gap-1.5 px-3 pb-1.5"
        onClick={e => e.stopPropagation()}
      >
        {/* Tactic picker */}
        <Dropdown label={<span className={tactic.color}>{tactic.label}</span>}>
          {TACTICS.map(t => (
            <button
              key={t.id}
              onClick={() => update({ phaseLabel: t.label, phaseId: t.id })}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-[9px] font-mono hover:bg-zinc-800/60 transition-colors',
                t.id === phaseId ? 'text-amber-400' : 'text-zinc-300',
              )}
            >
              {t.id === phaseId && <Check className="h-2.5 w-2.5" />}
              <span className={t.color}>{t.label}</span>
              <span className="text-zinc-600 ml-auto">{t.id}</span>
            </button>
          ))}
        </Dropdown>

        {/* Difficulty picker */}
        <Dropdown label={
          <span className={DIFFICULTY_COLORS[difficulty].split(' ')[0]}>{difficulty}</span>
        }>
          {(['Standard', 'Advanced', 'Complex'] as Difficulty[]).map(d => (
            <button
              key={d}
              onClick={() => update({ difficulty: d })}
              className={cn(
                'w-full px-3 py-1.5 text-left text-[9px] font-mono hover:bg-zinc-800/60 transition-colors',
                DIFFICULTY_COLORS[d].split(' ')[0],
              )}
            >
              {d}
            </button>
          ))}
        </Dropdown>

        {/* KSA/JQS multi-select */}
        <KsaJqsDropdown
          ksaIds={ksaIds}
          jqsIds={jqsIds}
          childTtpIds={childTtpIds}
          onChange={update}
        />

        {/* Mark ready button — appears when name + tactic are set but not yet pushed */}
        {contributionStatus === 'draft' && variationName.trim().length > 3 && (
          <button
            onClick={() => update({ contributionStatus: 'ready' })}
            className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/30 hover:bg-amber-400/20 transition-colors flex-shrink-0"
          >
            <Check className="h-2.5 w-2.5" />
            Mark ready
          </button>
        )}
      </div>
    </div>
  );
}