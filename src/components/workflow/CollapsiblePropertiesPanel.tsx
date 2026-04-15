// src/components/workflow/CollapsiblePropertiesPanel.tsx
// Collapsible panel wrapper with connection-aware variable resolution

import { useState, useCallback, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import { 
  Settings, 
  FileText, 
  Clock, 
  Cog, 
  MessageSquare, 
  Server,
  GitBranch,
  CircleDot,
  CheckCircle2,
  PlayCircle,
  Archive,
  PenLine,
  Wifi,
  WifiOff,
  RefreshCw,
  Play,
  Square,
  Terminal,
} from 'lucide-react';
import { PropertiesPanel } from './PropertiesPanel';
import { AIAssistantPanel } from './AIAssistantPanel';
import { LifecycleStage } from './Toolbar';
import { 
  OpforNodeData, 
  ExecutionLogEntry, 
  OpforGlobalSettings, 
  OpforNodeDefinition, 
  MitreTactic,
  CanvasVariable,
} from '@/types/opfor';
import { 
  NodeInstance, 
  ConnectionContext,
} from '@/services/nodeInstanceUtils';
import { LibraryModule } from '@/services/libraryModuleService';
import { cn } from '@/lib/utils';

type PanelTab = 'properties' | 'sequence' | 'log' | 'settings' | 'ai-chat' | 'infrastructure' | 'lifecycle';

// Infrastructure state type
export interface InfrastructureState {
  c2Connected: boolean;
  c2Host?: string;
  c2Port?: number;
  robotAvailable: boolean;
  robotVersion?: string;
  listeners: string[];
  payloads: string[];
}

interface CollapsiblePropertiesPanelProps {
  selectedNode: { id: string; data: OpforNodeData } | null;
  nodes: { id: string; data: OpforNodeData }[];
  timerLog: ExecutionLogEntry[];
  globalSettings: OpforGlobalSettings;
  onSettingsChange: (settings: OpforGlobalSettings) => void;
  onNodeDataChange: (nodeId: string, newData: OpforNodeData) => void;
  onAddNodeToCanvas?: (definition: OpforNodeDefinition) => void;
  availableVariables?: Record<string, CanvasVariable>;
  edges?: Edge[];
  nodeInstances?: Map<string, NodeInstance>;
  connectionContext?: ConnectionContext;
  nodeMap?: Map<string, Node>;
  lifecycleStage?: LifecycleStage;
  onLifecycleChange?: (stage: LifecycleStage) => void;
  infrastructureStatus?: InfrastructureState;
}

export function CollapsiblePropertiesPanel({
  selectedNode,
  nodes,
  timerLog,
  globalSettings,
  onSettingsChange,
  onNodeDataChange,
  onAddNodeToCanvas,
  availableVariables = {},
  edges = [],
  nodeInstances,
  connectionContext,
  nodeMap,
  lifecycleStage = 'draft',
  onLifecycleChange,
  infrastructureStatus,
}: CollapsiblePropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab | null>(null);
  const [viewingModule, setViewingModule] = useState<LibraryModule | null>(null);

  const handleTabClick = (tab: PanelTab) => {
    setActiveTab(activeTab === tab ? null : tab);
    setViewingModule(null);
  };

  const handleAddModuleToCanvas = useCallback((module: LibraryModule) => {
    if (!onAddNodeToCanvas) return;

    const definition: OpforNodeDefinition = {
      id: module._key || module.id || `module-${Date.now()}`,
      name: module.name || 'Unnamed Module',
      icon: module.icon || '⚡',
      tactic: (module.tactic as MitreTactic) || 'control',
      category: module.category || 'general',
      subcategory: module.subcategory || '',
      description: module.description || '',
      riskLevel: module.riskLevel || 'medium',
      estimatedDuration: module.estimatedDuration || '1-5 min',
      inputs: module.inputs || [],
      outputs: module.outputs || [],
      parameters: module.parameters || [],
      executionType: module.executionType || 'shell_command',
      cobaltStrikeCommand: module.cobaltStrikeCommand,
      robotKeyword: module.robotKeyword,
      robotTemplate: module.robotTemplate,
      shellCommand: module.shellCommand,
      requirements: module.requirements || {},
      robotFramework: module.robotFramework,
    };

    onAddNodeToCanvas(definition);
  }, [onAddNodeToCanvas]);

  const handleViewModule = useCallback((module: LibraryModule) => {
    setViewingModule(module);
  }, []);

  const tabs: Array<{ id: PanelTab; icon: React.ReactNode; label: string; color: string }> = [
    { id: 'properties', icon: <Settings className="h-5 w-5" />, label: 'Node Config', color: 'text-blue-400' },
    { id: 'sequence', icon: <FileText className="h-5 w-5" />, label: 'Sequence', color: 'text-purple-400' },
    { id: 'log', icon: <Clock className="h-5 w-5" />, label: 'Execution Log', color: 'text-green-400' },
    { id: 'settings', icon: <Cog className="h-5 w-5" />, label: 'Global Settings', color: 'text-amber-400' },
    { id: 'lifecycle', icon: <GitBranch className="h-5 w-5" />, label: 'Lifecycle Stage', color: 'text-pink-400' },
    { id: 'ai-chat', icon: <MessageSquare className="h-5 w-5" />, label: 'AI Assistant', color: 'text-cyan-400' },
    { id: 'infrastructure', icon: <Server className="h-5 w-5" />, label: 'Infrastructure', color: 'text-orange-400' },
  ];

  return (
    <div className="flex h-full border-l border-panel-border bg-panel">
      {/* Icon Bar */}
      <div className="w-12 bg-zinc-950 border-l border-zinc-800 flex flex-col items-center py-4 gap-2">
        {tabs.map((tab) => (
          <div key={tab.id} className="relative group">
            <button
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                'w-10 h-10 rounded-md flex items-center justify-center transition-all relative',
                activeTab === tab.id ? `bg-zinc-800 ${tab.color}` : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              )}
            >
              {tab.icon}
              {activeTab === tab.id && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-current rounded-l" />
              )}
              {tab.id === 'infrastructure' && infrastructureStatus?.c2Connected && (
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-zinc-950" />
              )}
            </button>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full mr-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
              <div className="bg-zinc-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg border border-zinc-800">
                {tab.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Content Panel */}
      {activeTab && (
        <div className="w-80 animate-in slide-in-from-right duration-200">
          {activeTab === 'ai-chat' ? (
            <AIAssistantPanel onAddToCanvas={handleAddModuleToCanvas} onViewModule={handleViewModule} />
          ) : activeTab === 'infrastructure' ? (
            <InfrastructurePanel nodes={nodes} infrastructureStatus={infrastructureStatus} globalSettings={globalSettings} />
          ) : activeTab === 'lifecycle' ? (
            <LifecyclePanel currentStage={lifecycleStage} onStageChange={onLifecycleChange} nodeCount={nodes.length} />
          ) : viewingModule ? (
            <ModuleDetailView module={viewingModule} onClose={() => setViewingModule(null)} onAddToCanvas={() => handleAddModuleToCanvas(viewingModule)} />
          ) : (
            <PropertiesPanel
              selectedNode={selectedNode}
              nodes={nodes}
              timerLog={timerLog}
              globalSettings={globalSettings}
              onSettingsChange={onSettingsChange}
              onNodeDataChange={onNodeDataChange}
              activeTab={activeTab === 'sequence' ? 'instructions' : activeTab}
              availableVariables={availableVariables}
              edges={edges}
              nodeInstances={nodeInstances}
              connectionContext={connectionContext}
              nodeMap={nodeMap}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Lifecycle Panel
// ============================================================================

interface LifecyclePanelProps {
  currentStage: LifecycleStage;
  onStageChange?: (stage: LifecycleStage) => void;
  nodeCount: number;
}

const lifecycleStages: Array<{
  id: LifecycleStage;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}> = [
  { id: 'draft', label: 'Draft', description: 'Initial development. TTPs can be modified freely.', icon: <PenLine className="h-4 w-4" />, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10', borderColor: 'border-zinc-500/30' },
  { id: 'review', label: 'Review', description: 'Pending approval by team lead.', icon: <CircleDot className="h-4 w-4" />, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/30' },
  { id: 'approved', label: 'Approved', description: 'Validated and ready for execution.', icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30' },
  { id: 'active', label: 'Active', description: 'Currently executing on target.', icon: <PlayCircle className="h-4 w-4" />, color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' },
  { id: 'archived', label: 'Archived', description: 'Completed. Read-only for reference.', icon: <Archive className="h-4 w-4" />, color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' },
];

function LifecyclePanel({ currentStage, onStageChange, nodeCount }: LifecyclePanelProps) {
  const currentStageInfo = lifecycleStages.find(s => s.id === currentStage) || lifecycleStages[0];
  const currentIndex = lifecycleStages.findIndex(s => s.id === currentStage);

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="px-4 py-3 border-b border-panel-border">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-pink-400" />
          Lifecycle Stage
        </h3>
        <p className="text-xs text-muted-foreground mt-1">Manage campaign workflow state</p>
      </div>

      <div className="px-4 py-4 border-b border-panel-border bg-zinc-950/30">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-2">Current Stage</div>
        <div className={cn("flex items-center gap-3 p-3 rounded-md border", currentStageInfo.bgColor, currentStageInfo.borderColor)}>
          <div className={cn("p-2 rounded-md bg-zinc-900/50", currentStageInfo.color)}>{currentStageInfo.icon}</div>
          <div className="flex-1">
            <div className={cn("font-semibold text-sm", currentStageInfo.color)}>{currentStageInfo.label}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{nodeCount} TTP{nodeCount !== 1 ? 's' : ''} in campaign</div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 border-b border-panel-border">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-3">Progress</div>
        <div className="flex items-center gap-1">
          {lifecycleStages.map((stage, idx) => (
            <div key={stage.id} className="flex items-center flex-1">
              <div className={cn("h-1.5 flex-1 rounded-full transition-colors", idx <= currentIndex ? currentStageInfo.color.replace('text-', 'bg-') : 'bg-zinc-800')} />
              {idx < lifecycleStages.length - 1 && <div className="w-1" />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[9px] text-zinc-600 font-mono">DRAFT</span>
          <span className="text-[9px] text-zinc-600 font-mono">ARCHIVED</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-3">Change Stage</div>
        <div className="space-y-2">
          {lifecycleStages.map((stage) => {
            const isActive = stage.id === currentStage;
            return (
              <button
                key={stage.id}
                onClick={() => onStageChange?.(stage.id)}
                disabled={!onStageChange}
                className={cn(
                  "w-full text-left p-3 rounded-md border transition-all",
                  isActive ? cn(stage.bgColor, stage.borderColor) : "bg-zinc-900/30 border-zinc-800 hover:bg-zinc-900/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("p-1.5 rounded", isActive ? stage.color : "text-zinc-500")}>{stage.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-xs font-medium", isActive ? stage.color : "text-zinc-300")}>{stage.label}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{stage.description}</div>
                  </div>
                  {isActive && <div className={cn("w-2 h-2 rounded-full", stage.color.replace('text-', 'bg-'))} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 border-t border-panel-border bg-zinc-950/30 space-y-2">
        {currentStage === 'draft' && (
          <button onClick={() => onStageChange?.('review')} className="w-full py-2 rounded-md bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-medium flex items-center justify-center gap-2">
            <CircleDot className="h-3.5 w-3.5" /> Submit for Review
          </button>
        )}
        {currentStage === 'review' && (
          <button onClick={() => onStageChange?.('approved')} className="w-full py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve Campaign
          </button>
        )}
        {currentStage === 'approved' && (
          <button onClick={() => onStageChange?.('active')} className="w-full py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center justify-center gap-2">
            <PlayCircle className="h-3.5 w-3.5" /> Begin Execution
          </button>
        )}
        {currentStage === 'active' && (
          <button onClick={() => onStageChange?.('archived')} className="w-full py-2 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center justify-center gap-2">
            <Archive className="h-3.5 w-3.5" /> Archive Campaign
          </button>
        )}
        {currentStage !== 'draft' && (
          <button onClick={() => onStageChange?.('draft')} className="w-full py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium">
            Return to Draft
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Module Detail View
// ============================================================================

interface ModuleDetailViewProps {
  module: LibraryModule;
  onClose: () => void;
  onAddToCanvas: () => void;
}

function ModuleDetailView({ module, onClose, onAddToCanvas }: ModuleDetailViewProps) {
  const tacticConfig: Record<string, { label: string; icon: string; color: string }> = {
    'TA0001': { label: 'Initial Access', icon: '🚪', color: 'text-blue-400' },
    'TA0002': { label: 'Execution', icon: '⚡', color: 'text-orange-400' },
    'TA0003': { label: 'Persistence', icon: '🔒', color: 'text-purple-400' },
    'TA0011': { label: 'Command & Control', icon: '📡', color: 'text-yellow-400' },
    'control': { label: 'Control Flow', icon: '⚙️', color: 'text-zinc-400' },
  };

  const tactic = tacticConfig[module.tactic] || tacticConfig['control'];

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="px-4 py-3 border-b border-panel-border bg-zinc-950/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{module.icon || tactic.icon}</span>
            <div>
              <h3 className="font-semibold text-sm text-zinc-100">{module.name}</h3>
              <span className={cn("text-[10px]", tactic.color)}>{tactic.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">← Back</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {module.description && (
          <div>
            <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">Description</h4>
            <p className="text-xs text-zinc-400">{module.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <h4 className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">Risk Level</h4>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded border inline-block",
              module.riskLevel === 'critical' ? 'text-red-500 bg-red-500/10 border-red-500/30' :
              module.riskLevel === 'high' ? 'text-orange-500 bg-orange-500/10 border-orange-500/30' :
              module.riskLevel === 'medium' ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30' :
              'text-green-500 bg-green-500/10 border-green-500/30'
            )}>
              {module.riskLevel?.toUpperCase() || 'UNKNOWN'}
            </span>
          </div>
          <div>
            <h4 className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">Execution Type</h4>
            <span className="text-xs text-zinc-400 font-mono">{module.executionType || 'N/A'}</span>
          </div>
        </div>

        {module.parameters && module.parameters.length > 0 && (
          <div>
            <h4 className="text-[10px] font-semibold text-zinc-500 uppercase mb-2">Parameters</h4>
            <div className="space-y-1.5">
              {module.parameters.map((param) => (
                <div key={param.id} className="flex items-center justify-between p-2 rounded bg-zinc-900/50 border border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-cyan-400">{param.id}</span>
                    {param.required && <span className="text-[8px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">REQ</span>}
                  </div>
                  <span className="text-[10px] text-zinc-500">{param.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-panel-border bg-zinc-950/30">
        <button onClick={onAddToCanvas} className="w-full py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium">
          Add to Canvas
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Infrastructure Panel - Teamserver start/stop + CS library status
// ============================================================================

interface TeamserverStatusResponse {
  running: boolean;
  pid: number | null;
  host: string | null;
  port: number;
  binary_exists: boolean;
  binary_path: string;
  cs_dir: string;
  cs_library: {
    path: string | null;
    found: boolean;
    is_mock: boolean;
  };
  log_path: string;
  log_tail: string[];
}

interface InfrastructurePanelProps {
  nodes: { id: string; data: OpforNodeData }[];
  infrastructureStatus?: InfrastructureState;
  globalSettings: OpforGlobalSettings;
}

function InfrastructurePanel({ nodes, infrastructureStatus, globalSettings }: InfrastructurePanelProps) {
  const OPERATOR_API = 'http://localhost:8001';

  const [tsStatus, setTsStatus] = useState<TeamserverStatusResponse | null>(null);
  const [tsOpPending, setTsOpPending] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const infrastructure = analyzeInfrastructure(nodes);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${OPERATOR_API}/api/c2/teamserver/status`);
      if (r.ok) setTsStatus(await r.json());
    } catch { /* server not yet ready */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStatus();
    setIsRefreshing(false);
  };

  const handleStart = async () => {
    const ip   = globalSettings.c2Server?.trim() || tsStatus?.host || '';
    const pass = globalSettings.csPass?.trim()   || '';
    const dir  = globalSettings.csDir?.trim()    || '/opt/cobaltstrike';

    if (!ip || !pass) {
      alert('Set Teamserver IP and Password in Global Settings (⚙ icon) before starting.');
      return;
    }

    setTsOpPending(true);
    try {
      const r = await fetch(`${OPERATOR_API}/api/c2/teamserver/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, password: pass, cs_dir: dir }),
      });
      const data = await r.json();
      if (!data.success) {
        alert(`Failed to start teamserver:\n${data.error}`);
      } else {
        setShowLog(true);
        setTimeout(fetchStatus, 3000);
      }
    } catch (e) {
      alert(`Request failed: ${e}`);
    } finally {
      setTsOpPending(false);
    }
  };

  const handleStop = async () => {
    if (!confirm('Stop the Cobalt Strike teamserver?')) return;
    setTsOpPending(true);
    try {
      const r = await fetch(`${OPERATOR_API}/api/c2/teamserver/stop`, { method: 'POST' });
      const data = await r.json();
      if (!data.success) alert(`Failed to stop: ${data.error}`);
      setTimeout(fetchStatus, 2000);
    } catch (e) {
      alert(`Request failed: ${e}`);
    } finally {
      setTsOpPending(false);
    }
  };

  const isRunning     = tsStatus?.running ?? false;
  const binaryExists  = tsStatus?.binary_exists ?? false;
  const hasConfig     = !!(globalSettings.c2Server?.trim() && globalSettings.csPass?.trim());
  const libraryIsMock = tsStatus?.cs_library?.is_mock ?? false;
  const libraryFound  = tsStatus?.cs_library?.found ?? false;

  return (
    <div className="h-full flex flex-col bg-panel">
      {/* Header */}
      <div className="px-4 py-3 border-b border-panel-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Server className="h-4 w-4 text-orange-400" />
              Infrastructure
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Live status · start/stop services</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={cn("p-1.5 rounded-md hover:bg-zinc-800 transition-colors", isRefreshing && "animate-spin")}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-zinc-500" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* ── Teamserver ── */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <span>🎯</span> CS Teamserver
          </h4>

          <div className={cn("p-3 rounded-md border transition-colors",
            isRunning ? "bg-green-500/10 border-green-500/30" : "bg-zinc-900/50 border-zinc-800"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-md flex-shrink-0",
                isRunning ? "bg-green-500/20 text-green-400" : "bg-zinc-800 text-zinc-500")}>
                {isRunning ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className={cn("text-sm font-semibold",
                  tsStatus === null ? "text-zinc-500" :
                  isRunning ? "text-green-400" : "text-zinc-400"
                )}>
                  {tsStatus === null ? "Checking…" : isRunning ? "Running" : "Stopped"}
                </div>
                {isRunning && tsStatus && (
                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                    {tsStatus.host}:{tsStatus.port}
                    {tsStatus.pid && <span className="ml-2 text-zinc-600">PID {tsStatus.pid}</span>}
                  </div>
                )}
                {!isRunning && !binaryExists && tsStatus && (
                  <div className="text-[10px] text-red-400/80 mt-0.5">
                    Binary not found: {tsStatus.binary_path}
                  </div>
                )}
                {!isRunning && binaryExists && !hasConfig && (
                  <div className="text-[10px] text-zinc-600 mt-0.5">
                    Set CS IP + Password in Global Settings
                  </div>
                )}
              </div>

              {isRunning ? (
                <button
                  onClick={handleStop}
                  disabled={tsOpPending}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono font-bold",
                    "bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-400",
                    "disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  )}
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={tsOpPending || !binaryExists || !hasConfig}
                  title={
                    !binaryExists ? `Binary not found at ${tsStatus?.binary_path}` :
                    !hasConfig    ? "Configure CS IP + Password in Global Settings first" :
                    "Start teamserver"
                  }
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono font-bold",
                    "bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 text-green-400",
                    "disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  )}
                >
                  <Play className="h-3 w-3" />
                  Start
                </button>
              )}
            </div>
          </div>

          {/* CS Library status */}
          {tsStatus && (
            <div className={cn(
              "flex items-start gap-2 px-3 py-2 rounded-md border text-[10px] font-mono",
              !libraryFound
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : libraryIsMock
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : "bg-zinc-900/50 border-zinc-800 text-zinc-500"
            )}>
              <span className="mt-0.5 flex-shrink-0">
                {!libraryFound ? "⚠" : libraryIsMock ? "⚠" : "✓"}
              </span>
              <div>
                <div className="font-semibold mb-0.5">
                  {!libraryFound
                    ? "cobaltstrikec2 not found"
                    : libraryIsMock
                      ? "Using mock library"
                      : "Real CS library"}
                </div>
                {tsStatus.cs_library.path && (
                  <div className="text-zinc-600 break-all">{tsStatus.cs_library.path}</div>
                )}
                {(libraryIsMock || !libraryFound) && (
                  <div className="mt-1 text-zinc-600">
                    Set <span className="text-zinc-400">CS_LIBRARY_DIR</span> env var to your cobaltstrikec2/ path
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Log tail */}
          {tsStatus && (
            <div>
              <button
                onClick={() => setShowLog(v => !v)}
                className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors mt-1"
              >
                <Terminal className="h-3 w-3" />
                {showLog ? "Hide" : "Show"} teamserver log
              </button>
              {showLog && (
                <div className="mt-2 bg-zinc-950 border border-zinc-800 rounded-md p-2.5 max-h-52 overflow-y-auto font-mono">
                  {tsStatus.log_tail.length === 0 ? (
                    <p className="text-[10px] text-zinc-600">No log output yet — log at {tsStatus.log_path}</p>
                  ) : (
                    tsStatus.log_tail.map((line, i) => (
                      <div key={i} className={cn("text-[10px] leading-5 whitespace-pre-wrap break-all",
                        line.includes('[+]') ? 'text-green-400' :
                        line.includes('[*]') ? 'text-blue-400'  :
                        line.includes('[!]') || line.includes('Error') ? 'text-red-400' :
                        line.startsWith('===') ? 'text-amber-400' :
                        'text-zinc-400'
                      )}>
                        {line}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Robot Framework ── */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <span>🤖</span> Robot Framework
          </h4>
          <div className={cn("p-3 rounded-md border",
            infrastructureStatus?.robotAvailable
              ? "bg-green-500/10 border-green-500/30"
              : "bg-red-500/10 border-red-500/30"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-md",
                infrastructureStatus?.robotAvailable
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400")}>
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className={cn("text-sm font-medium",
                  infrastructureStatus?.robotAvailable ? "text-green-400" : "text-red-400")}>
                  {infrastructureStatus?.robotAvailable ? "Ready" : "Not Available"}
                </div>
                {infrastructureStatus?.robotVersion && (
                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                    {infrastructureStatus.robotVersion}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active Listeners */}
        {(infrastructureStatus?.listeners?.length ?? 0) > 0 && (
          <InfrastructureSection
            title="Active Listeners"
            items={infrastructureStatus!.listeners.map(n => ({ name: n, required: false, status: 'active' as const }))}
            icon="📡"
          />
        )}

        {/* Generated Payloads */}
        {(infrastructureStatus?.payloads?.length ?? 0) > 0 && (
          <InfrastructureSection
            title="Generated Payloads"
            items={infrastructureStatus!.payloads.map(n => ({ name: n, required: false, status: 'active' as const }))}
            icon="📦"
          />
        )}

        <InfrastructureSection title="Required Libraries"  items={infrastructure.libraries}    icon="📚" />
        <InfrastructureSection title="External Tools"      items={infrastructure.externalTools} icon="🔧" />

        {nodes.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Server className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Add nodes to see required infrastructure</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface InfrastructureSectionProps {
  title: string;
  items: Array<{ name: string; required: boolean; status?: 'active' | 'inactive' | 'pending' }>;
  icon: string;
}

function InfrastructureSection({ title, items, icon }: InfrastructureSectionProps) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <span>{icon}</span> {title}
      </h4>
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={cn('w-2 h-2 rounded-full flex-shrink-0',
                item.status === 'active'  ? 'bg-green-500' :
                item.status === 'pending' ? 'bg-yellow-500 animate-pulse' :
                'bg-zinc-600'
              )} />
              <span className="text-xs font-mono truncate">{item.name}</span>
            </div>
            {item.required && (
              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded flex-shrink-0">Required</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function analyzeInfrastructure(nodes: { id: string; data: OpforNodeData }[]) {
  const externalTools = new Set<string>();
  const libraries = new Set<string>();
  nodes.forEach((node) => {
    const requirements = node?.data?.definition?.requirements;
    if (requirements) {
      if (Array.isArray(requirements.externalTools)) requirements.externalTools.forEach((tool) => externalTools.add(tool));
      if (Array.isArray(requirements.libraries)) requirements.libraries.forEach((lib) => libraries.add(lib));
    }
    const robotConfig = node?.data?.definition?.robotFramework;
    if (robotConfig?.libraries) robotConfig.libraries.forEach((lib: string) => libraries.add(lib));
  });
  return {
    externalTools: Array.from(externalTools).map((name) => ({ name, required: true, status: 'inactive' as const })),
    libraries: Array.from(libraries).map((name) => ({ name, required: true, status: 'inactive' as const })),
  };
}