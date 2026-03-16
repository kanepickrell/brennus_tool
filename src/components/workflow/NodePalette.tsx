// src/components/workflow/NodePalette.tsx
import { useState, useMemo } from 'react';
import { Search, ChevronRight, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLibraryModules } from '@/hooks/useLibraryModules';
import { OpforNodeDefinition, MitreTactic } from '@/types/opfor';
import { cn } from '@/lib/utils';

const tacticConfig: Record<string, { label: string; icon: string; color: string }> = {
  'TA0001': { label: 'Initial Access', icon: '🚪', color: 'text-blue-400' },
  'TA0002': { label: 'Execution', icon: '⚡', color: 'text-orange-400' },
  'TA0003': { label: 'Persistence', icon: '🔒', color: 'text-purple-400' },
  'TA0005': { label: 'Defense Evasion', icon: '🛡️', color: 'text-indigo-400' },
  'TA0006': { label: 'Credential Access', icon: '🔑', color: 'text-red-400' },
  'TA0007': { label: 'Discovery', icon: '🔍', color: 'text-green-400' },
  'TA0008': { label: 'Lateral Movement', icon: '🚀', color: 'text-purple-400' },
  'TA0009': { label: 'Collection', icon: '📦', color: 'text-cyan-400' },
  'TA0011': { label: 'Command & Control', icon: '📡', color: 'text-yellow-400' },
  'control': { label: 'Control Flow', icon: '⚙️', color: 'text-zinc-400' },
};

export function NodePalette({ onDragStart }: { onDragStart: (e: React.DragEvent, node: OpforNodeDefinition) => void }) {
  const [search, setSearch] = useState('');
  
  // Fetch modules from API
  const { modules, loading, error, refresh } = useLibraryModules();

  // Convert API modules to OpforNodeDefinition format and group by tactic
  const categories = useMemo(() => {
    if (!modules || modules.length === 0) return [];

    // DEBUG: Log first module to see actual field names
    if (modules.length > 0) {
      const sample = modules[0] as any;
      console.log('🔍 Sample module from API:', {
        keys: Object.keys(sample),
        hasInputs: 'inputs' in sample,
        hasInputsCapital: 'Inputs' in sample,
        inputs: sample.inputs,
        Inputs: sample.Inputs,
        hasOutputs: 'outputs' in sample,
        hasOutputsCapital: 'Outputs' in sample,
        outputs: sample.outputs,
        Outputs: sample.Outputs,
        hasParameters: 'parameters' in sample,
        hasParametersCapital: 'Parameters' in sample,
        parameters: sample.parameters,
        Parameters: sample.Parameters,
      });
    }

    // Convert to OpforNodeDefinition format with safe defaults
    // NOTE: ArangoDB may store fields with capital letters (Inputs vs inputs)
    // Convert to OpforNodeDefinition format with safe defaults
    const nodeDefinitions: OpforNodeDefinition[] = modules.map(module => {
      const m = module as any;
      
      // Normalize tactic - handle both "TA0011" format and "Command and Control" format
      let tactic = m.tactic || m.Tactic || 'control';
      
      // Map human-readable names to MITRE IDs
      const tacticNameToId: Record<string, string> = {
        'initial access': 'TA0001',
        'execution': 'TA0002',
        'persistence': 'TA0003',
        'privilege escalation': 'TA0004',
        'defense evasion': 'TA0005',
        'credential access': 'TA0006',
        'discovery': 'TA0007',
        'lateral movement': 'TA0008',
        'collection': 'TA0009',
        'exfiltration': 'TA0010',
        'command and control': 'TA0011',
        'command & control': 'TA0011',
        'c2': 'TA0011',
      };
      
      // If tactic is not already a TA#### format, try to map it
      if (!tactic.startsWith('TA')) {
        tactic = tacticNameToId[tactic.toLowerCase()] || 'control';
      }
      
      return {
        id: m.id || m._key || `module-${Date.now()}`,
        name: m.name || m.Name || 'Unnamed Module',
        icon: m.icon || m.Icon || '⚡',
        tactic: tactic as MitreTactic,
        category: m.category || m.Category || 'general',
        subcategory: m.subcategory || m.Subcategory || '',
        description: m.description || m.Description || '',
        riskLevel: m.riskLevel || m.RiskLevel || 'medium',
        estimatedDuration: m.estimatedDuration || m.EstimatedDuration || '1-5 min',
        inputs: m.inputs || m.Inputs || [],
        outputs: m.outputs || m.Outputs || [],
        parameters: m.parameters || m.Parameters || [],
        executionType: m.executionType || m.ExecutionType || 'shell_command',
        cobaltStrikeCommand: m.cobaltStrikeCommand || m.CobaltStrikeCommand || undefined,
        robotKeyword: m.robotKeyword || m.RobotKeyword || undefined,
        robotTemplate: m.robotTemplate || m.RobotTemplate || undefined,
        robotFramework: m.robotFramework || m.RobotFramework || undefined,  // ADD THIS
        shellCommand: m.shellCommand || m.ShellCommand || undefined,
        requirements: m.requirements || m.Requirements || {},
      };
    });

    // Group by tactic
    const tactics: MitreTactic[] = [
      'TA0001', 'TA0002', 'TA0003', 'TA0005', 'TA0006', 
      'TA0007', 'TA0008', 'TA0009', 'TA0011', 'control'
    ];

    return tactics
      .map(tactic => ({
        tactic,
        nodes: nodeDefinitions.filter(n => n.tactic === tactic)
      }))
      .filter(cat => cat.nodes.length > 0);
  }, [modules]);

  // Loading state
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

  // Error state
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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            placeholder="Search TTPs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800 text-xs"
          />
        </div>
        {/* Module count */}
        <div className="mt-2 text-[10px] text-zinc-600">
          {modules.length} modules loaded
        </div>
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
                    .map(node => (
                      <div
                        key={node.id}
                        draggable
                        onDragStart={e => onDragStart(e, node)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded bg-zinc-900/50 border border-zinc-800",
                          "cursor-grab hover:border-zinc-600 hover:bg-zinc-900 transition-colors",
                          "active:cursor-grabbing active:scale-95"
                        )}
                      >
                        <span className="text-base flex-shrink-0">{node.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] text-zinc-200 font-medium truncate block">
                            {node.name}
                          </span>
                          {/* Optional: Show risk level */}
                          <span className={cn(
                            "text-[9px] font-bold uppercase inline-block mt-0.5",
                            node.riskLevel === 'critical' ? 'text-red-500' :
                            node.riskLevel === 'high' ? 'text-orange-500' :
                            node.riskLevel === 'medium' ? 'text-yellow-500' :
                            'text-green-500'
                          )}>
                            {node.riskLevel || 'medium'}
                          </span>
                        </div>
                      </div>
                    ))}
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}