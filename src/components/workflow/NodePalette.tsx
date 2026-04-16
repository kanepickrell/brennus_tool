// src/components/workflow/NodePalette.tsx
// Browse mode: existing catalog behavior (drag individual nodes)
// Guided mode: variation card feed — pick a complete attack chain
// Custom commands can be authored inline and deleted via a trash icon on the card.

import { useState, useMemo, useEffect } from 'react';
import {
  Search, ChevronRight, RefreshCw, Sparkles, BookOpen,
  ChevronDown, CheckCircle2, ArrowRight,
  Plus as PlusIcon, Trash2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLibraryModules } from '@/hooks/useLibraryModules';
import { OpforNodeDefinition, MitreTactic } from '@/types/opfor';
import { cn } from '@/lib/utils';
import { C2_BADGE } from '@/constants/c2';
import { API_CONFIG } from '@/config/api';
import { useToast } from '@/hooks/use-toast';
import {
  GuidedVariation,
  GUIDED_PHASES,
  GUIDED_VARIATIONS,
  getVariationsForPhase,
  TACTIC_COLORS,
  DIFFICULTY_CONFIG,
} from '@/data/guidedVariations';
import { CustomCommandDialog } from './CustomCommandDialog';

// ── Tactic config ────────────────────────────────────────────────────────────

const tacticConfig: Record<string, { label: string; icon: string; color: string }> = {
  'TA0001': { label: 'Initial Access',        icon: '🚪', color: 'text-blue-400'    },
  'TA0004': { label: 'Privilege Escalation',  icon: '👑', color: 'text-pink-400'    },
  'TA0042': { label: 'Resource Development',  icon: '🏗️', color: 'text-teal-400'    },
  'TA0002': { label: 'Execution',             icon: '⚡', color: 'text-orange-400'  },
  'TA0003': { label: 'Persistence',           icon: '🔒', color: 'text-purple-400'  },
  'TA0005': { label: 'Defense Evasion',       icon: '🛡️', color: 'text-indigo-400'  },
  'TA0006': { label: 'Credential Access',     icon: '🔑', color: 'text-red-400'     },
  'TA0007': { label: 'Discovery',             icon: '🔍', color: 'text-green-400'   },
  'TA0008': { label: 'Lateral Movement',      icon: '🚀', color: 'text-purple-400'  },
  'TA0009': { label: 'Collection',            icon: '📦', color: 'text-cyan-400'    },
  'TA0011': { label: 'Command & Control',     icon: '📡', color: 'text-yellow-400'  },
  'TA0043': { label: 'Reconnaissance',        icon: '📡', color: 'text-emerald-400' },
  'control': { label: 'Control Flow',         icon: '⚙️', color: 'text-zinc-400'    },
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface NodePaletteProps {
  onDragStart: (e: React.DragEvent, node: OpforNodeDefinition) => void;
  onSelectVariation?: (variation: GuidedVariation) => void;
  tacticFilter?: string | null;
  onClearTacticFilter?: () => void;
  framingMode?: boolean;
  onToggleFramingMode?: () => void;
  onContainerizeSelected?: (selectedIds: string[]) => void;
  selectedNodeIds?: string[];
}

// ── Helper: build a full OpforNodeDefinition from a raw API module object ───
// Centralised here so Browse and Guided produce identical node definitions.
// IMPORTANT: propagates `isCustom` so the palette can badge operator-authored cards.

function buildNodeDefinition(m: any): OpforNodeDefinition & { isCustom?: boolean } {
  let tactic = m.tactic || m.Tactic || 'control';

  const tacticNameToId: Record<string, string> = {
    'initial access':       'TA0001',
    'execution':            'TA0002',
    'persistence':          'TA0003',
    'privilege escalation': 'TA0004',
    'defense evasion':      'TA0005',
    'credential access':    'TA0006',
    'discovery':            'TA0007',
    'lateral movement':     'TA0008',
    'collection':           'TA0009',
    'exfiltration':         'TA0010',
    'command and control':  'TA0011',
    'command & control':    'TA0011',
    'c2':                   'TA0011',
    'reconnaissance':       'TA0043',
  };

  if (!tactic.startsWith('TA')) {
    tactic = tacticNameToId[tactic.toLowerCase()] || 'control';
  }

  return {
    id:                  m.id || m._key || `module-${Date.now()}`,
    name:                m.name || m.Name || 'Unnamed Module',
    icon:                m.icon || m.Icon || '⚡',
    tactic:              tactic as MitreTactic,
    category:            m.category || m.Category || 'general',
    subcategory:         m.subcategory || m.Subcategory || '',
    description:         m.description || m.Description || '',
    riskLevel:           m.riskLevel || m.RiskLevel || 'medium',
    estimatedDuration:   m.estimatedDuration || m.EstimatedDuration || '1-5 min',
    inputs:              m.inputs  || m.Inputs  || [],
    outputs:             m.outputs || m.Outputs || [],
    parameters:          m.parameters || m.Parameters || [],
    executionType:       m.executionType || m.ExecutionType || 'shell',
    cobaltStrikeCommand: m.cobaltStrikeCommand || m.CobaltStrikeCommand || undefined,
    robotKeyword:        m.robotKeyword  || m.RobotKeyword  || undefined,
    robotTemplate:       m.robotTemplate || m.RobotTemplate || undefined,
    robotFramework:      m.robotFramework || m.RobotFramework || undefined,
    shellCommand:        m.shellCommand || m.ShellCommand || undefined,
    requirements:        m.requirements || m.Requirements || {},
    // Operator-authored flag — propagated through so the palette can badge it.
    isCustom:            m.isCustom === true,
  };
}

// ── Mode Toggle ──────────────────────────────────────────────────────────────

function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'browse' | 'guided';
  onChange: (m: 'browse' | 'guided') => void;
}) {
  return (
    <div className="flex items-center bg-zinc-900/80 border border-zinc-800 rounded-sm p-0.5 w-full">
      <button
        onClick={() => onChange('browse')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-all duration-150',
          mode === 'browse'
            ? 'bg-zinc-800 border border-zinc-700 text-zinc-100'
            : 'text-zinc-500 hover:text-zinc-300'
        )}
      >
        <BookOpen className="h-3 w-3" />
        Browse
      </button>
      <button
        onClick={() => onChange('guided')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-all duration-150',
          mode === 'guided'
            ? 'bg-amber-500/15 border border-amber-500/40 text-amber-400'
            : 'text-zinc-500 hover:text-zinc-300'
        )}
      >
        <Sparkles className="h-3 w-3" />
        Guided
      </button>
    </div>
  );
}

// ── Guided Mode ──────────────────────────────────────────────────────────────

function VariationStepRow({
  step,
  isLast,
}: {
  step: GuidedVariation['steps'][0];
  isLast: boolean;
}) {
  const tacticClass = TACTIC_COLORS[step.tactic] || 'text-zinc-400 bg-zinc-400/10 border-zinc-400/30';

  return (
    <div className="flex items-start gap-2 relative">
      {!isLast && (
        <div className="absolute left-[13px] top-[22px] w-px bg-zinc-800" style={{ height: 'calc(100% + 4px)' }} />
      )}
      <div className="flex-shrink-0 w-[26px] h-[26px] rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center z-10">
        <span className="text-[9px] font-bold text-zinc-400 font-mono">{step.stepNum}</span>
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-zinc-200">{step.icon} {step.displayName}</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <span className={cn('text-[8px] font-bold font-mono px-1.5 py-0.5 rounded border', tacticClass)}>
            {step.ttpId}
          </span>
          <span className="text-[9px] text-zinc-500 truncate">{step.ttpName}</span>
        </div>
      </div>
    </div>
  );
}

function VariationCard({
  variation,
  onSelect,
  isSelected,
}: {
  variation: GuidedVariation;
  onSelect: (v: GuidedVariation) => void;
  isSelected: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const diffConfig = DIFFICULTY_CONFIG[variation.difficulty];

  return (
    <div
      className={cn(
        'rounded-lg border transition-all duration-200',
        isSelected
          ? 'border-amber-500/60 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.08)]'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60'
      )}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold font-mono text-zinc-600 uppercase tracking-widest">
              VAR {variation.variationIndex}
            </span>
            {isSelected && <CheckCircle2 className="h-3 w-3 text-amber-400" />}
          </div>
          <span className={cn('text-[8px] font-bold px-1.5 py-0.5 rounded border', diffConfig.color)}>
            {diffConfig.label.toUpperCase()}
          </span>
        </div>

        <h4 className={cn(
          'text-[12px] font-semibold leading-tight mb-0.5',
          isSelected ? 'text-amber-300' : 'text-zinc-100'
        )}>
          {variation.name}
        </h4>
        <p className="text-[10px] text-zinc-500 italic mb-2">&ldquo;{variation.tagline}&rdquo;</p>

        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors w-full text-left"
        >
          <div className="flex items-center gap-0.5">
            {variation.steps.map((_, i) => (
              <div key={i} className={cn('w-4 h-1 rounded-full', isSelected ? 'bg-amber-500/60' : 'bg-zinc-700')} />
            ))}
          </div>
          <span className="ml-1">{variation.steps.length} steps</span>
          <ChevronDown className={cn('h-3 w-3 ml-auto transition-transform duration-200', expanded && 'rotate-180')} />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800/60">
          <p className="text-[10px] text-zinc-400 leading-relaxed mb-3 italic">{variation.narrative}</p>
          <div className="space-y-0">
            {variation.steps.map((step, i) => (
              <VariationStepRow key={step.stepNum} step={step} isLast={i === variation.steps.length - 1} />
            ))}
          </div>
        </div>
      )}

      <div className="px-3 pb-3">
        <button
          onClick={() => onSelect(variation)}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2 rounded-md text-[11px] font-semibold transition-all duration-150',
            isSelected
              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 hover:text-white'
          )}
        >
          {isSelected ? (
            <><CheckCircle2 className="h-3.5 w-3.5" /> Selected — place on canvas</>
          ) : (
            <><ArrowRight className="h-3.5 w-3.5" /> Use this variation</>
          )}
        </button>
      </div>
    </div>
  );
}

function PhaseSection({
  phaseId,
  phaseLabel,
  phaseIcon,
  selectedVariationId,
  isOpen,
  onOpenChange,
  onSelect,
}: {
  phaseId: string;
  phaseLabel: string;
  phaseIcon: string;
  selectedVariationId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (v: GuidedVariation) => void;
}) {
  const variations = getVariationsForPhase(phaseId);
  const tacticCfg = tacticConfig[phaseId];
  const hasSelection = variations.some(v => v.id === selectedVariationId);

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="w-full group">
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-md transition-colors',
          isOpen ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/40',
        )}>
          <ChevronRight className={cn('h-3 w-3 text-zinc-600 transition-transform duration-200', isOpen && 'rotate-90')} />
          <span className="text-base leading-none">{phaseIcon}</span>
          <span className={cn('text-[11px] font-bold uppercase tracking-tight flex-1 text-left', tacticCfg?.color || 'text-zinc-400')}>
            {phaseLabel}
          </span>
          <div className="flex items-center gap-1.5">
            {hasSelection && <CheckCircle2 className="h-3 w-3 text-amber-400" />}
            <span className="text-[9px] text-zinc-600 font-mono">{variations.length}</span>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-2 pb-2 pt-1 space-y-2">
          {variations.map(v => (
            <VariationCard
              key={v.id}
              variation={v}
              onSelect={onSelect}
              isSelected={v.id === selectedVariationId}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── GuidedView ───────────────────────────────────────────────────────────────
// Receives the already-loaded `modules` from the parent so it can look up each
// step's full OpforNodeDefinition (with robotFramework, parameters, inputs,
// outputs) before calling onSelectVariation.

function GuidedView({
  onSelectVariation,
  modules,
}: {
  onSelectVariation?: (v: GuidedVariation) => void;
  modules: any[];
}) {
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});
  const [openPhaseId, setOpenPhaseId] = useState<string>(GUIDED_PHASES[0].id);

  // Build a lookup map: _key / id → full module object
  const moduleMap = useMemo(() => {
    const map = new Map<string, any>();
    modules.forEach(m => {
      if (m._key) map.set(m._key, m);
      if (m.id)   map.set(m.id,   m);
    });
    return map;
  }, [modules]);

  const handleSelect = (v: GuidedVariation) => {
    setSelectedIds(prev => ({ ...prev, [v.phaseId]: v.id }));

    // Auto-advance to next uncovered phase
    const currentPhaseIndex = GUIDED_PHASES.findIndex(p => p.id === v.phaseId);
    const nextPhase = GUIDED_PHASES
      .slice(currentPhaseIndex + 1)
      .find(p => !selectedIds[p.id]);

    if (nextPhase) {
      setTimeout(() => setOpenPhaseId(nextPhase.id), 350);
    } else {
      setTimeout(() => setOpenPhaseId(''), 350);
    }

    // ── Enrich variation steps with full module definitions ──────────────────
    const enrichedVariation: GuidedVariation = {
      ...v,
      steps: v.steps.map(step => {
        const raw = moduleMap.get(step.moduleKey);
        if (raw) {
          return {
            ...step,
            _resolvedDefinition: buildNodeDefinition(raw),
          } as any;
        }
        console.warn(`[GuidedView] Module key not found in library: "${step.moduleKey}"`);
        return step;
      }),
    };

    onSelectVariation?.(enrichedVariation);
  };

  const selectedVariations = GUIDED_PHASES
    .map(p => {
      const id = selectedIds[p.id];
      return id ? GUIDED_VARIATIONS.find(v => v.id === id) : null;
    })
    .filter(Boolean) as GuidedVariation[];

  const totalSteps = selectedVariations.reduce((s, v) => s + v.steps.length, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-zinc-800/60">
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Select a variation per phase. Each chain attaches to the previous — building one continuous sequence.
        </p>
      </div>

      {selectedVariations.length > 0 && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Chain so far</span>
            <span className="text-[9px] text-amber-400 font-mono">{totalSteps} steps</span>
          </div>
          {selectedVariations.map((v, i) => (
            <div key={v.id} className="flex items-center gap-2">
              {i > 0 && <div className="absolute left-[22px] -mt-2 w-px h-2 bg-zinc-700" />}
              <CheckCircle2 className="h-3 w-3 text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-zinc-300 truncate block">{v.name}</span>
                <span className="text-[8px] text-zinc-600">{v.steps.length} steps · {v.phase}</span>
              </div>
              <button
                onClick={() => {
                  setSelectedIds(prev => { const next = { ...prev }; delete next[v.phaseId]; return next; });
                  setOpenPhaseId(v.phaseId);
                }}
                className="text-[9px] text-zinc-700 hover:text-zinc-400 font-mono flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1 mt-2">
        <div className="px-2 pb-4 space-y-1">
          {GUIDED_PHASES.map(phase => (
            <PhaseSection
              key={phase.id}
              phaseId={phase.id}
              phaseLabel={phase.label}
              phaseIcon={phase.icon}
              selectedVariationId={selectedIds[phase.id] ?? null}
              isOpen={openPhaseId === phase.id}
              onOpenChange={(open) => setOpenPhaseId(open ? phase.id : '')}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Browse Mode ───────────────────────────────────────────────────────────────

function BrowseView({
  onDragStart,
  tacticFilter,
  onClearTacticFilter,
  modules,
  loading,
  error,
  refresh,
  onRequestDeleteCustom,
}: {
  onDragStart: (e: React.DragEvent, node: OpforNodeDefinition) => void;
  tacticFilter?: string | null;
  onClearTacticFilter?: () => void;
  modules: any[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  onRequestDeleteCustom: (node: OpforNodeDefinition & { isCustom?: boolean }) => void;
}) {
  const [search, setSearch] = useState('');
  const [c2Filter, setC2Filter] = useState<string>('all');

  useEffect(() => {
    if (tacticFilter) setSearch('');
  }, [tacticFilter]);

  const categories = useMemo(() => {
    if (!modules || modules.length === 0) return [];

    const nodeDefinitions = modules.map(buildNodeDefinition);

    const tactics: MitreTactic[] = [
      'TA0042', 'TA0043', 'TA0001', 'TA0002', 'TA0003', 'TA0004', 'TA0005',
      'TA0006', 'TA0007', 'TA0008', 'TA0009', 'TA0011', 'control',
    ];

    return tactics
      .map(tactic => ({
        tactic,
        nodes: nodeDefinitions
          .filter(n => n.tactic === tactic)
          .filter(n => c2Filter === 'all' || n.executionType === c2Filter)
          .filter(n => !tacticFilter || n.tactic === tacticFilter),
      }))
      .filter(cat => cat.nodes.length > 0);
  }, [modules, c2Filter, tacticFilter]);

  const presentC2Types = useMemo(() => {
    if (!modules) return [];
    const seen = new Set<string>();
    modules.forEach((m: any) => {
      const t = m.executionType || m.ExecutionType;
      if (t) seen.add(t);
    });
    return Array.from(seen).sort();
  }, [modules]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <RefreshCw className="h-6 w-6 animate-spin text-zinc-600 mx-auto" />
          <p className="text-xs text-zinc-500">Loading modules...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="text-red-500 text-3xl">⚠️</div>
          <p className="text-xs text-red-400">Failed to load modules</p>
          <p className="text-[10px] text-zinc-600">{error}</p>
          <button onClick={refresh} className="px-3 py-1.5 bg-zinc-800 text-zinc-200 rounded text-xs hover:bg-zinc-700 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            placeholder="Search TTPs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800 text-xs"
          />
        </div>

        {presentC2Types.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setC2Filter('all')}
              className={cn(
                'text-[9px] font-bold px-2 py-0.5 rounded border transition-colors',
                c2Filter === 'all'
                  ? 'bg-zinc-700 border-zinc-500 text-zinc-100'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300',
              )}
            >
              ALL
            </button>
            {presentC2Types.map(type => {
              const badge = C2_BADGE[type];
              if (!badge) return null;
              const active = c2Filter === type;
              return (
                <button
                  key={type}
                  onClick={() => setC2Filter(active ? 'all' : type)}
                  style={active ? { background: badge.hex + '33', borderColor: badge.hex + '99', color: badge.hex } : undefined}
                  className={cn(
                    'text-[9px] font-bold px-2 py-0.5 rounded border transition-colors',
                    !active && 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300',
                  )}
                  title={badge.label}
                >
                  {badge.abbr}
                </button>
              );
            })}
          </div>
        )}

        <div className="text-[10px] text-zinc-600">{modules.length} modules loaded</div>

        {tacticFilter && (
          <div className="flex items-center justify-between px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded">
            <span className="text-[9px] font-mono text-amber-400 uppercase tracking-wider">Filtered: {tacticFilter}</span>
            <button onClick={onClearTacticFilter} className="text-[9px] text-amber-600 hover:text-amber-400 font-mono transition-colors">
              ✕ clear
            </button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-4 space-y-1">
          {categories.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-xs">No modules available</div>
          ) : (
            categories.map((cat) => (
              <Collapsible key={cat.tactic} defaultOpen>
                <CollapsibleTrigger className="w-full group">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-900">
                    <ChevronRight className="h-3 w-3 text-zinc-600 group-data-[state=open]:rotate-90 transition-transform" />
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-tight">
                      {tacticConfig[cat.tactic]?.label || cat.tactic}
                    </span>
                    <span className="ml-auto text-[10px] text-zinc-600">{cat.nodes.length}</span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-4 pr-2 py-1 space-y-1">
                  {cat.nodes
                    .filter(n => n.name.toLowerCase().includes(search.toLowerCase()))
                    .map(node => {
                      const badge = C2_BADGE[node.executionType];
                      const isCustom = (node as any).isCustom === true;
                      return (
                        <div
                          key={node.id}
                          draggable
                          onDragStart={e => onDragStart(e, node)}
                          className={cn(
                            'group/card flex items-center gap-2 p-2 rounded bg-zinc-900/50 border',
                            isCustom ? 'border-amber-500/30' : 'border-zinc-800',
                            'cursor-grab hover:border-zinc-600 hover:bg-zinc-900 transition-colors',
                            'active:cursor-grabbing active:scale-95',
                          )}
                        >
                          <span className="text-base flex-shrink-0">{node.icon}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] text-zinc-200 font-medium truncate block">{node.name}</span>
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
                                <span
                                  style={{
                                    fontSize: '9px', fontWeight: 700, padding: '0px 4px',
                                    borderRadius: '3px', background: badge.hex + '22',
                                    color: badge.hex, border: `1px solid ${badge.hex}55`,
                                    letterSpacing: '0.04em', lineHeight: '14px',
                                  }}
                                  title={badge.label}
                                >
                                  {badge.abbr}
                                </span>
                              )}
                              {isCustom && (
                                <span
                                  style={{
                                    fontSize: '9px', fontWeight: 700, padding: '0px 4px',
                                    borderRadius: '3px', background: '#f59e0b22',
                                    color: '#f59e0b', border: '1px solid #f59e0b55',
                                    letterSpacing: '0.04em', lineHeight: '14px',
                                  }}
                                  title="Operator-authored — pending dev team review"
                                >
                                  CUSTOM
                                </span>
                              )}
                            </div>
                          </div>
                          {isCustom && (
                            <button
                              type="button"
                              onClick={(e) => {
                                // Stop propagation so the parent card's drag/click
                                // handlers don't fire when hitting the trash icon.
                                e.stopPropagation();
                                e.preventDefault();
                                onRequestDeleteCustom(node);
                              }}
                              // Hide on the card until hover so operators don't
                              // accidentally hit it during drag.
                              className={cn(
                                'flex-shrink-0 p-1 rounded opacity-0 group-hover/card:opacity-100',
                                'text-zinc-500 hover:text-red-400 hover:bg-red-500/10',
                                'transition-all duration-150',
                              )}
                              title="Delete this custom command"
                              // Prevent the card from starting a drag when the
                              // user grabs the trash icon.
                              draggable={false}
                              onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Main NodePalette ──────────────────────────────────────────────────────────

export function NodePalette({
  onDragStart,
  onSelectVariation,
  tacticFilter,
  onClearTacticFilter,
  framingMode = false,
  onToggleFramingMode,
  onContainerizeSelected,
  selectedNodeIds = [],
}: NodePaletteProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'browse' | 'guided'>('browse');
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  // Which custom command (if any) is pending deletion — drives the AlertDialog.
  const [pendingDelete, setPendingDelete] = useState<
    (OpforNodeDefinition & { isCustom?: boolean }) | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  // Load modules ONCE at the top level — shared between Browse and Guided
  // so Guided can look up full definitions without a separate fetch.
  const { modules, loading, error, refresh } = useLibraryModules();

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `${API_CONFIG.BASE_URL}/api/custom-commands/${encodeURIComponent(pendingDelete.id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(detail || `HTTP ${res.status}`);
      }
      toast({
        title: 'Custom command deleted',
        description: `"${pendingDelete.name}" was removed from the palette.`,
      });
      setPendingDelete(null);
      refresh();
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-r border-zinc-800">

      {/* ── Header ── */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-bold text-zinc-100 uppercase tracking-widest">
            {mode === 'browse' ? 'Tactic Library' : 'Guided Build'}
          </h2>
          <div className="flex items-center gap-1.5">
            {mode === 'browse' && (
              <button
                onClick={() => setCustomDialogOpen(true)}
                title="Author a new custom command module"
                className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border text-amber-400 bg-amber-400/10 border-amber-400/30 hover:bg-amber-400/20 hover:border-amber-400/50 transition-colors"
              >
                <PlusIcon className="h-2.5 w-2.5" />
                Custom
              </button>
            )}
            {mode === 'browse' && onToggleFramingMode && (
              <button
                onClick={onToggleFramingMode}
                title={framingMode ? 'Exit frame mode (Esc)' : 'Shift+click nodes to select, then containerize as a TTP variation'}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border transition-colors',
                  framingMode
                    ? 'text-amber-300 bg-amber-400/15 border-amber-400/40 hover:bg-amber-400/25'
                    : 'text-zinc-400 bg-zinc-800/60 border-zinc-700/50 hover:text-zinc-200 hover:border-zinc-500/60',
                )}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
                  <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2.5 1.5"/>
                </svg>
                {framingMode ? 'Cancel' : 'Frame'}
              </button>
            )}
          </div>
        </div>

        {mode === 'browse' && framingMode && (
          <div className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              <span className="text-[9px] font-mono text-amber-300 uppercase tracking-wider">Frame Mode Active</span>
            </div>
            <p className="text-[9px] text-zinc-400 leading-relaxed">
              Shift+click nodes on the canvas to select them, then containerize as a tagged TTP variation.
            </p>
            {selectedNodeIds.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[9px] font-mono text-amber-400">
                  {selectedNodeIds.length} node{selectedNodeIds.length !== 1 ? 's' : ''} selected
                </div>
                <button
                  onClick={() => onContainerizeSelected?.(selectedNodeIds)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[9px] font-mono font-bold text-zinc-900 bg-amber-400 hover:bg-amber-300 transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
                    <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M3 5h4M5 3v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Containerize {selectedNodeIds.length} nodes
                </button>
              </div>
            ) : (
              <div className="text-[9px] text-zinc-600 font-mono">No nodes selected yet</div>
            )}
          </div>
        )}

        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {mode === 'browse' ? (
          <BrowseView
            onDragStart={onDragStart}
            tacticFilter={tacticFilter}
            onClearTacticFilter={onClearTacticFilter}
            modules={modules}
            loading={loading}
            error={error}
            refresh={refresh}
            onRequestDeleteCustom={setPendingDelete}
          />
        ) : (
          <GuidedView
            onSelectVariation={onSelectVariation}
            modules={modules}
          />
        )}
      </div>

      {/* ── Custom Command Dialog ── */}
      <CustomCommandDialog
        open={customDialogOpen}
        onClose={() => setCustomDialogOpen(false)}
        onSaved={refresh}
      />

      {/* ── Delete confirmation ── */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open && !deleting) setPendingDelete(null); }}
      >
        <AlertDialogContent className="bg-zinc-950 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100 flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-400" />
              Delete custom command?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently remove{' '}
              <span className="text-amber-300 font-semibold">
                &ldquo;{pendingDelete?.name}&rdquo;
              </span>{' '}
              from the palette. The module JSON will be deleted from{' '}
              <code className="text-[10px] bg-zinc-900 px-1 py-0.5 rounded text-zinc-300">
                server/custom_commands/
              </code>.
              <br /><br />
              Any nodes already placed on the canvas will keep their definition,
              but the module will no longer be available to drag in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className="bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleConfirmDelete}
              className="bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 hover:text-red-200"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}