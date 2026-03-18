// src/components/workflow/NodePalette.tsx
import { useState, useMemo, useEffect } from 'react';
import { Search, ChevronRight, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLibraryModules } from '@/hooks/useLibraryModules';
import { OpforNodeDefinition, MitreTactic } from '@/types/opfor';
import { cn } from '@/lib/utils';
import { C2_BADGE } from '@/constants/c2';

const tacticConfig: Record<string, { label: string; icon: string; color: string }> = {
  'TA0001': { label: 'Initial Access',        icon: '🚪', color: 'text-blue-400'   },
  'TA0004': { label: 'Privilege Escalation',  icon: '👑', color: 'text-pink-400'   },
  'TA0042': { label: 'Resource Development',  icon: '🏗️', color: 'text-teal-400'   },
  'TA0002': { label: 'Execution',             icon: '⚡', color: 'text-orange-400' },
  'TA0003': { label: 'Persistence',           icon: '🔒', color: 'text-purple-400' },
  'TA0005': { label: 'Defense Evasion',       icon: '🛡️', color: 'text-indigo-400' },
  'TA0006': { label: 'Credential Access',     icon: '🔑', color: 'text-red-400'    },
  'TA0007': { label: 'Discovery',             icon: '🔍', color: 'text-green-400'  },
  'TA0008': { label: 'Lateral Movement',      icon: '🚀', color: 'text-purple-400' },
  'TA0009': { label: 'Collection',            icon: '📦', color: 'text-cyan-400'   },
  'TA0011': { label: 'Command & Control',     icon: '📡', color: 'text-yellow-400' },
  'control': { label: 'Control Flow',         icon: '⚙️', color: 'text-zinc-400'   },
};

export function NodePalette({ onDragStart, tacticFilter, onClearTacticFilter }: {
  onDragStart: (e: React.DragEvent, node: OpforNodeDefinition) => void;
  tacticFilter?: string | null;
  onClearTacticFilter?: () => void;
}) {
  const [search, setSearch]     = useState('');
  const [c2Filter, setC2Filter] = useState<string>('all');

  // When tacticFilter comes in from JQR panel, clear search so results show
  useEffect(() => {
    if (tacticFilter) setSearch('');
  }, [tacticFilter]);

  const { modules, loading, error, refresh } = useLibraryModules();

  const categories = useMemo(() => {
    if (!modules || modules.length === 0) return [];

    if (modules.length > 0) {
      const sample = modules[0] as any;
      console.log('🔍 Sample module from API:', {
        keys: Object.keys(sample),
        inputs: sample.inputs,
        outputs: sample.outputs,
        parameters: sample.parameters,
      });
    }

    const nodeDefinitions: OpforNodeDefinition[] = modules.map(module => {
      const m = module as any;

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
        inputs:              m.inputs || m.Inputs || [],
        outputs:             m.outputs || m.Outputs || [],
        parameters:          m.parameters || m.Parameters || [],
        executionType:       m.executionType || m.ExecutionType || 'shell',
        cobaltStrikeCommand: m.cobaltStrikeCommand || m.CobaltStrikeCommand || undefined,
        robotKeyword:        m.robotKeyword || m.RobotKeyword || undefined,
        robotTemplate:       m.robotTemplate || m.RobotTemplate || undefined,
        robotFramework:      m.robotFramework || m.RobotFramework || undefined,
        shellCommand:        m.shellCommand || m.ShellCommand || undefined,
        requirements:        m.requirements || m.Requirements || {},
      };
    });

    const tactics: MitreTactic[] = [
      'TA0042', 'TA0001', 'TA0002', 'TA0003', 'TA0004', 'TA0005',
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

  // Derive which C2 types are actually present in loaded modules
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
      <div className="h-full flex flex-col bg-zinc-950 border-r border-zinc-800">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-100 mb-3 uppercase tracking-widest">Tactic Library</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <RefreshCw className="h-6 w-6 animate-spin text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-500">Loading modules...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col bg-zinc-950 border-r border-zinc-800">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-100 mb-3 uppercase tracking-widest">Tactic Library</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <div className="text-red-500 text-3xl">⚠️</div>
            <p className="text-xs text-red-400">Failed to load modules</p>
            <p className="text-[10px] text-zinc-600">{error}</p>
            <button
              onClick={refresh}
              className="px-3 py-1.5 bg-zinc-800 text-zinc-200 rounded text-xs hover:bg-zinc-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-r border-zinc-800">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest">Tactic Library</h2>
          <button
            onClick={refresh}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Refresh modules"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            placeholder="Search TTPs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800 text-xs"
          />
        </div>

        {/* C2 filter — only renders when more than one framework is present */}
        {presentC2Types.length > 1 && (
          <div className="mt-2 flex gap-1 flex-wrap">
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
                  style={active ? {
                    background:  badge.hex + '33',
                    borderColor: badge.hex + '99',
                    color:       badge.hex,
                  } : undefined}
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

        <div className="mt-2 text-[10px] text-zinc-600">
          {modules.length} modules loaded
        </div>

        {/* JQR tactic filter banner */}
        {tacticFilter && (
          <div className="mt-2 flex items-center justify-between px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded">
            <span className="text-[9px] font-mono text-amber-400 uppercase tracking-wider">
              Filtered: {tacticFilter}
            </span>
            <button
              onClick={onClearTacticFilter}
              className="text-[9px] text-amber-600 hover:text-amber-400 font-mono transition-colors"
            >
              ✕ clear
            </button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {categories.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-xs">
              No modules available
            </div>
          ) : (
            categories.map((cat) => (
              <Collapsible key={cat.tactic} defaultOpen>
                <CollapsibleTrigger className="w-full group">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-900">
                    <ChevronRight className="h-3 w-3 text-zinc-600 group-data-[state=open]:rotate-90 transition-transform" />
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-tight">
                      {tacticConfig[cat.tactic]?.label || cat.tactic}
                    </span>
                    <span className="ml-auto text-[10px] text-zinc-600">
                      {cat.nodes.length}
                    </span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-4 pr-2 py-1 space-y-1">
                  {cat.nodes
                    .filter(n => n.name.toLowerCase().includes(search.toLowerCase()))
                    .map(node => {
                      const badge = C2_BADGE[node.executionType];
                      return (
                        <div
                          key={node.id}
                          draggable
                          onDragStart={e => onDragStart(e, node)}
                          className={cn(
                            'flex items-center gap-2 p-2 rounded bg-zinc-900/50 border border-zinc-800',
                            'cursor-grab hover:border-zinc-600 hover:bg-zinc-900 transition-colors',
                            'active:cursor-grabbing active:scale-95',
                          )}
                        >
                          <span className="text-base flex-shrink-0">{node.icon}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] text-zinc-200 font-medium truncate block">
                              {node.name}
                            </span>
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
                                    fontSize:      '9px',
                                    fontWeight:    700,
                                    padding:       '0px 4px',
                                    borderRadius:  '3px',
                                    background:    badge.hex + '22',
                                    color:         badge.hex,
                                    border:        `1px solid ${badge.hex}55`,
                                    letterSpacing: '0.04em',
                                    lineHeight:    '14px',
                                  }}
                                  title={badge.label}
                                >
                                  {badge.abbr}
                                </span>
                              )}
                            </div>
                          </div>
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