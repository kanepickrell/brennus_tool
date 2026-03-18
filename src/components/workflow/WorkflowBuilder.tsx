// src/components/workflow/WorkflowBuilder.tsx
// Main workflow canvas with variable inheritance support and execution panel

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  MiniMap,
  Edge,
  Node,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import { NodePalette } from './NodePalette';
import { CollapsiblePropertiesPanel, InfrastructureState } from './CollapsiblePropertiesPanel';
import { Toolbar, ViewMode, LifecycleStage } from './Toolbar';
import { ScriptView } from './ScriptView';
import { SaveLoadDialog } from '../opfor/SaveLoadDialog';
import { OpforNode } from './OpforNode';
import { ExecutionPanel, useExecutionState } from './ExecutionPanel';
import { OperatorHeader } from './OperatorHeader';
import { JQRPanel } from './JQRPanel';
import { ReadinessCheck } from './ReadinessCheck';
import {
  OpforGlobalSettings,
  OpforNodeData,
  OpforNodeDefinition,
  ExecutionLogEntry,
  WorkflowFile,
  CanvasVariable,
} from '@/types/opfor';
import { CampaignConfig } from '@/types/campaign';
import { useToast } from '@/hooks/use-toast';
import { WorkflowService } from '@/services/workflowService';
import {
  buildNodeInstances,
  buildConnectionContext,
  NodeInstance,
  ConnectionContext,
} from '@/services/nodeInstanceUtils';
import {
  simulateWorkflow,
  checkInfrastructureStatus,
} from '@/services/executionService';
import { generateRobotScript } from '@/services/robotScriptGenerator';

const nodeTypes = { opforNode: OpforNode };

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

function WorkflowBuilderInner({ campaign }: { campaign?: CampaignConfig | null }) {
  const { toast } = useToast();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const hasInitialNode = useRef(false);

  const { screenToFlowPosition, zoomIn, zoomOut, fitView, getViewport } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('canvas');
  const [lifecycleStage, setLifecycleStage] = useState<LifecycleStage>('draft');

  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
  const [globalSettings, setGlobalSettings] = useState<OpforGlobalSettings>({
    executionPlanName: 'Neon Saguaro',
    targetNetwork: '',
    c2Server: '10.50.100.5',
    sessionId: 'session_01',
    operator: '',
    redTeam: '',
    notes: '',
    workdir: '%{HOME}/sandworm/',
    csUser: 'operator',
    csPass: '',
    csDir: '/opt/cobaltstrike',
    csPort: '50050',
  });

  // ── Seed globalSettings from campaign config on mount ──────────────────────
  useEffect(() => {
    if (!campaign) return;
    setGlobalSettings(prev => ({
      ...prev,
      executionPlanName: campaign.name             || prev.executionPlanName,
      operator:          campaign.operatorName      || prev.operator,
      targetNetwork:     campaign.rangeEnvironment  || prev.targetNetwork,
      c2Server:          campaign.c2Config?.csIp    || prev.c2Server,
      csUser:            campaign.c2Config?.csUser   || prev.csUser,
      csPass:            campaign.c2Config?.csPass   || prev.csPass,
      csDir:             campaign.c2Config?.csDir    || prev.csDir,
      csPort:            campaign.c2Config?.csPort   || prev.csPort,
      workdir:           campaign.c2Config?.workdir  || prev.workdir,
    }));
  }, [campaign]);

  // ── JQR profile + reactive state ──────────────────────────────────────────
  const jqrProfile = campaign?.jqrProfile ?? null;

  // ── Tactic filter (driven by JQR panel "+" button) ────────────────────────
  const [tacticFilter, setTacticFilter] = useState<string | null>(null);

  // ── Readiness check modal ─────────────────────────────────────────────────
  const [showReadiness, setShowReadiness] = useState(false);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);

  // ============================================================================
  // EXECUTION PANEL STATE
  // ============================================================================
  const [executionPanelOpen, setExecutionPanelOpen] = useState(false);
  const [infrastructureStatus, setInfrastructureStatus] = useState<InfrastructureState>({
    c2Connected: false,
    robotAvailable: false,
    listeners: [],
    payloads: [],
  });

  const {
    state: executionState,
    addLog,
    startExecution,
    setCurrentNode,
    completeStep,
    completeExecution,
    stopExecution,
    resetExecution,
  } = useExecutionState();

  const abortControllerRef = useRef<AbortController | null>(null);

  // Check infrastructure on mount
  useEffect(() => {
    checkInfrastructureStatus()
      .then(status => {
        setInfrastructureStatus({
          c2Connected: status.c2Connected,
          c2Host: status.c2Host,
          c2Port: status.c2Port,
          robotAvailable: status.robotAvailable,
          robotVersion: status.robotVersion,
          listeners: status.listeners,
          payloads: status.payloads,
        });
      })
      .catch(() => {
        setInfrastructureStatus({
          c2Connected: false,
          robotAvailable: true,
          robotVersion: 'Simulated',
          listeners: [],
          payloads: [],
        });
      });
  }, []);

  // ============================================================================
  // NODE INSTANCES & CONNECTION CONTEXT
  // ============================================================================
  const nodeInstances = useMemo((): Map<string, NodeInstance> => {
    return buildNodeInstances(nodes);
  }, [nodes]);

  const connectionContext = useMemo((): ConnectionContext => {
    return buildConnectionContext(edges);
  }, [edges]);

  const nodeMap = useMemo((): Map<string, Node> => {
    return new Map(nodes.map(n => [n.id, n]));
  }, [nodes]);

  // ============================================================================
  // GENERATED ROBOT SCRIPT
  // ============================================================================
  const generatedScript = useMemo(() => {
    if (nodes.length === 0) return null;
    try {
      const script = generateRobotScript(nodes, edges, globalSettings);
      console.log('Generated Robot script:', script.meta);
      return script;
    } catch (error) {
      console.error('Failed to generate Robot script:', error);
      return null;
    }
  }, [nodes, edges, globalSettings]);

  // ============================================================================
  // CANVAS VARIABLES
  // ============================================================================
  const availableVariables = useMemo((): Record<string, CanvasVariable> => {
    const vars: Record<string, CanvasVariable> = {};

    nodes.forEach(node => {
      const data = node.data as OpforNodeData;
      if (!data?.definition?.robotFramework?.variables) return;

      const robotConfig = data.definition.robotFramework;
      const instance = nodeInstances.get(node.id);

      robotConfig.variables?.forEach(varDef => {
        let value: string | number | undefined;

        if (varDef.fromParam && data.parameters) {
          value = data.parameters[varDef.fromParam] as string | number;
        }

        if (value === undefined || value === '') {
          const paramDef = data.definition.parameters?.find(p => p.id === varDef.fromParam);
          value = paramDef?.default as string | number ?? varDef.default ?? '';
        }

        const category = varDef.name.split('_')[0];
        const instanceVarName = instance
          ? `${varDef.name}${instance.variablePrefix}`
          : varDef.name;

        vars[instanceVarName] = {
          name: instanceVarName,
          value: value ?? '',
          sourceNodeId: node.id,
          sourceNodeName: data.definition.name,
          variableType: 'parameter',
          category,
        };
      });

      data.definition.outputs?.forEach(output => {
        const outputVarName = output.id.toUpperCase().replace(/-/g, '_');
        const category = outputVarName.split('_')[0];
        const instanceVarName = instance
          ? `${outputVarName}${instance.variablePrefix}`
          : outputVarName;

        vars[instanceVarName] = {
          name: instanceVarName,
          value: `\${${instanceVarName}}`,
          sourceNodeId: node.id,
          sourceNodeName: data.definition.name,
          variableType: 'output',
          category,
        };
      });
    });

    return vars;
  }, [nodes, nodeInstances]);

  const addLogEntry = useCallback(
    (type: ExecutionLogEntry['type'], message: string, details?: string, nodeId?: string) => {
      setExecutionLog(prev => [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date(),
          type,
          message,
          details,
          nodeId,
          operator: globalSettings.operator || undefined,
        },
        ...prev,
      ]);
    },
    [globalSettings.operator]
  );

  // Autosave every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (nodes.length > 0) {
        WorkflowService.autosave(nodes, edges, globalSettings, getViewport());
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [nodes, edges, globalSettings, getViewport]);

  // Initial zoom
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, minZoom: 0.7, maxZoom: 0.7 });
    }, 100);
    return () => clearTimeout(timer);
  }, [fitView]);

  // Delete handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )
        return;

      event.preventDefault();

      setNodes(nds => {
        const selected = nds.filter(n => n.selected);
        if (selected.length > 0) {
          selected.forEach(n => {
            const data = n.data as OpforNodeData;
            addLogEntry('update', `Deleted: ${data.definition.name}`, undefined, n.id);
          });
          toast({ title: 'Nodes Deleted', description: `${selected.length} node(s) removed` });
        }
        return nds.filter(n => !n.selected);
      });

      setEdges(eds => {
        const selected = eds.filter(e => e.selected);
        if (selected.length > 0)
          addLogEntry('update', `Deleted ${selected.length} connection(s)`);
        return eds.filter(e => !e.selected);
      });

      setSelectedNode(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setNodes, setEdges, addLogEntry, toast]);

  const handleNodeDataChange = useCallback(
    (nodeId: string, newData: OpforNodeData) => {
      setNodes(nds => nds.map(n => (n.id === nodeId ? { ...n, data: newData } : n)));
      setSelectedNode(prev => (prev?.id === nodeId ? { ...prev, data: newData } : prev));
      addLogEntry('update', 'TTP parameters updated', newData.definition.name, nodeId);
    },
    [setNodes, addLogEntry]
  );

  const ensureSafeNodeDef = useCallback(
    (nodeDef: OpforNodeDefinition): OpforNodeDefinition => ({
      ...nodeDef,
      inputs: nodeDef.inputs || [],
      outputs: nodeDef.outputs || [],
      parameters: nodeDef.parameters || [],
    }),
    []
  );

  const handleAddNodeFromAI = useCallback(
    (nodeDef: OpforNodeDefinition) => {
      const safeNodeDef = ensureSafeNodeDef(nodeDef);
      const viewport = getViewport();
      const position = {
        x: -viewport.x / viewport.zoom + 400,
        y: -viewport.y / viewport.zoom + 300,
      };

      const initialParams: Record<string, string | number> = {};
      safeNodeDef.parameters.forEach(param => {
        if (param.default !== undefined) initialParams[param.id] = param.default;
      });

      const newNode: Node = {
        id: `${safeNodeDef.id}-${Date.now()}`,
        type: 'opforNode',
        position,
        data: {
          definition: safeNodeDef,
          parameters: initialParams,
          label: safeNodeDef.name,
          validationState: 'unconfigured',
        } as OpforNodeData,
      };

      setNodes(nds => [...nds, newNode]);
      addLogEntry(
        'update',
        `Added from AI: ${safeNodeDef.name}`,
        safeNodeDef.description,
        newNode.id
      );
      toast({ title: '✓ Module Added', description: `${safeNodeDef.name} added to canvas` });
    },
    [getViewport, setNodes, addLogEntry, toast, ensureSafeNodeDef]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => setSelectedNode(node),
    []
  );
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(eds =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: 'hsl(210, 100%, 50%)', strokeWidth: 2 },
          },
          eds
        )
      );
      addLogEntry('update', 'Connection created', `${connection.source} → ${connection.target}`);
    },
    [setEdges, addLogEntry]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeDataString = event.dataTransfer.getData('application/json');
      if (!nodeDataString) return;

      let nodeDef: OpforNodeDefinition;
      try {
        nodeDef = JSON.parse(nodeDataString);
      } catch {
        return;
      }

      const safeNodeDef = ensureSafeNodeDef(nodeDef);
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const initialParams: Record<string, string | number> = {};
      safeNodeDef.parameters.forEach(param => {
        if (param.default !== undefined) initialParams[param.id] = param.default;
      });

      const newNode: Node = {
        id: `${safeNodeDef.id}-${Date.now()}`,
        type: 'opforNode',
        position,
        data: {
          definition: safeNodeDef,
          parameters: initialParams,
          label: safeNodeDef.name,
          validationState: 'unconfigured',
        } as OpforNodeData,
      };

      setNodes(nds => [...nds, newNode]);
      addLogEntry('update', `Added: ${safeNodeDef.name}`, safeNodeDef.description, newNode.id);

      // Only center on the FIRST node drop
      if (!hasInitialNode.current) {
        hasInitialNode.current = true;
        setTimeout(() => fitView({ padding: 0.3 }), 50);
      }
    },
    [screenToFlowPosition, setNodes, addLogEntry, ensureSafeNodeDef, fitView]
  );

  const onDragStart = useCallback(
    (event: React.DragEvent, nodeDefinition: OpforNodeDefinition) => {
      event.dataTransfer.setData('application/json', JSON.stringify(nodeDefinition));
      event.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const handleValidate = useCallback(() => {
    const issues: string[] = [];
    let hasIssues = false;

    const updatedNodes = nodes.map(node => {
      const nodeData = node.data as OpforNodeData;
      const nodeIssues: string[] = [];

      (nodeData.definition.parameters || []).forEach(param => {
        if (!param.required) return;
        const value = nodeData.parameters[param.id];
        if (
          value === undefined ||
          value === null ||
          value === '' ||
          (typeof value === 'string' && value.trim() === '')
        ) {
          nodeIssues.push(`Missing: ${param.label}`);
          issues.push(`${nodeData.definition.name}: Missing "${param.label}"`);
        }
      });

      (nodeData.definition.inputs || []).forEach(input => {
        if (!input.required) return;
        const hasConnection = edges.some(
          e => e.target === node.id && e.targetHandle === input.id
        );
        if (!hasConnection) {
          nodeIssues.push(`Missing input: ${input.label}`);
          issues.push(`${nodeData.definition.name}: Missing input "${input.label}"`);
        }
      });

      const validationState: OpforNodeData['validationState'] =
        nodeIssues.length > 0 ? 'configured' : 'validated';
      if (nodeIssues.length > 0) hasIssues = true;

      return { ...node, data: { ...nodeData, validationState } as OpforNodeData };
    });

    setNodes(updatedNodes);

    if (hasIssues) {
      addLogEntry('warning', 'Validation failed', `${issues.length} issue(s) found`);
      toast({
        title: '⚠️ Validation Failed',
        description: `Found ${issues.length} issue(s).`,
        variant: 'destructive',
      });
      return;
    }

    addLogEntry('validation', 'TTP chain validated', `${nodes.length} techniques validated`);
    toast({ title: '✅ Chain Valid', description: `${nodes.length} TTPs validated` });
  }, [nodes, edges, toast, addLogEntry, setNodes]);

  // ============================================================================
  // EXECUTION HANDLERS
  // ============================================================================
  const updateNodeState = useCallback(
    (nodeId: string, state: 'executing' | 'success' | 'failed' | 'validated') => {
      setNodes(nds =>
        nds.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, validationState: state } } : n
        )
      );
    },
    [setNodes]
  );

  const handleRunExecution = useCallback(async () => {
    const connectedNodeIds = new Set<string>();
    edges.forEach(e => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });
    const connectedNodes = nodes.filter(n => connectedNodeIds.has(n.id));

    if (connectedNodes.length === 0) {
      toast({
        title: 'No connected nodes',
        description: 'Connect nodes before running',
        variant: 'destructive',
      });
      return;
    }

    setExecutionPanelOpen(true);
    startExecution(connectedNodes.length);
    abortControllerRef.current = new AbortController();

    const success = await simulateWorkflow(
      nodes as Node<OpforNodeData>[],
      edges,
      {
        apiBaseUrl: 'http://localhost:8001',
        globalSettings: {
          csIp: globalSettings.c2Server || '10.50.100.5',
          csPort: 50050,
          csUser: globalSettings.operator || 'operator',
          csPassword: 'password',
          csDir: '/opt/cobaltstrike',
        },
      },
      {
        onLog: addLog,
        onNodeStart: (nodeId, nodeName) => {
          setCurrentNode(nodeId, nodeName);
          updateNodeState(nodeId, 'executing');
        },
        onNodeComplete: (nodeId, nodeName, success, message) => {
          completeStep(nodeId, nodeName, success, message);
          updateNodeState(nodeId, success ? 'success' : 'failed');
        },
        onInfrastructureUpdate: status =>
          setInfrastructureStatus({
            c2Connected: status.c2Connected,
            c2Host: status.c2Host,
            c2Port: status.c2Port,
            robotAvailable: status.robotAvailable,
            robotVersion: status.robotVersion,
            listeners: status.listeners,
            payloads: status.payloads,
          }),
      },
      abortControllerRef.current.signal
    );

    completeExecution(success);
  }, [
    nodes,
    edges,
    globalSettings,
    startExecution,
    addLog,
    setCurrentNode,
    completeStep,
    completeExecution,
    updateNodeState,
    toast,
  ]);

  const handleStopExecution = useCallback(() => {
    abortControllerRef.current?.abort();
    stopExecution();
  }, [stopExecution]);

  const handleRerunExecution = useCallback(() => {
    setNodes(nds =>
      nds.map(n => ({ ...n, data: { ...n.data, validationState: 'validated' } }))
    );
    resetExecution();
    handleRunExecution();
  }, [resetExecution, handleRunExecution, setNodes]);

  const handleHighlightNode = useCallback(
    (nodeId: string | null) => {
      setNodes(nds => nds.map(n => ({ ...n, selected: n.id === nodeId })));
    },
    [setNodes]
  );

  const handleSimulate = useCallback(() => handleRunExecution(), [handleRunExecution]);

  // ── Export — gates through readiness check ────────────────────────────────
  const handleExport = useCallback(() => {
    setShowReadiness(true);
  }, []);

  const handleConfirmExport = useCallback(() => {
    setShowReadiness(false);
    const operationCard = {
      name: globalSettings.executionPlanName,
      steps: nodes.map((node, idx) => ({
        step: idx + 1,
        technique: (node.data as OpforNodeData).definition.name,
      })),
    };
    console.log('Export:', operationCard);
    addLogEntry('export', 'Operation card exported', globalSettings.executionPlanName);
    toast({ title: '📄 Card Exported' });
  }, [nodes, globalSettings.executionPlanName, toast, addLogEntry]);

  const handleReset = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    resetExecution();
    hasInitialNode.current = false;
    setInfrastructureStatus({
      c2Connected: false,
      robotAvailable: true,
      robotVersion: 'Simulated',
      listeners: [],
      payloads: [],
    });
    addLogEntry('update', 'Canvas reset');
    toast({ title: 'Canvas Reset' });
  }, [setNodes, setEdges, addLogEntry, toast, resetExecution]);

  const handleLoadWorkflow = useCallback(
    (workflow: WorkflowFile) => {
      setNodes(workflow.nodes);
      setEdges(workflow.edges);
      setGlobalSettings(workflow.globalSettings);
      hasInitialNode.current = true;
      setTimeout(
        () =>
          fitView({
            padding: 0.2,
            minZoom: workflow.viewport.zoom,
            maxZoom: workflow.viewport.zoom,
          }),
        100
      );
      addLogEntry('update', 'Workflow loaded', workflow.metadata.name);
      toast({ title: 'Workflow Loaded', description: workflow.metadata.name });
    },
    [setNodes, setEdges, setGlobalSettings, fitView, addLogEntry, toast]
  );

  const panelNodes = useMemo(
    () => nodes.map(n => ({ id: n.id, data: n.data as OpforNodeData })),
    [nodes]
  );

  const panelSelectedNode = useMemo(
    () =>
      selectedNode
        ? { id: selectedNode.id, data: selectedNode.data as OpforNodeData }
        : null,
    [selectedNode]
  );

  const isScriptView = viewMode === 'script';

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">

      {/* ── LUMEN Header ── */}
      <OperatorHeader
        infrastructureStatus={infrastructureStatus}
        globalSettings={globalSettings}
      />

      <Toolbar
        viewMode={viewMode}
        lifecycleStage={lifecycleStage}
        onViewModeChange={setViewMode}
        onLifecycleChange={setLifecycleStage}
        onValidate={handleValidate}
        onSimulate={handleSimulate}
        onExport={handleExport}
        onReset={handleReset}
        onZoomIn={() => zoomIn()}
        onZoomOut={() => zoomOut()}
        onFitView={() => fitView()}
        onSave={() => setSaveDialogOpen(true)}
        onLoad={() => setLoadDialogOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Left: Tactic Library ── */}
        <div className="w-72 border-r border-panel-border flex-shrink-0">
          <NodePalette
            onDragStart={onDragStart}
            tacticFilter={tacticFilter}
            onClearTacticFilter={() => setTacticFilter(null)}
          />
        </div>

        {isScriptView ? (
          <div className="flex-1 flex min-w-0">
            <div className="flex-1 min-w-0">
              <ScriptView nodes={nodes} edges={edges} globalSettings={globalSettings} />
            </div>

            {/* Right panel with JQR panel above */}
            <div className="flex flex-col flex-shrink-0" style={{ width: 'auto' }}>
              <JQRPanel
                nodes={nodes}
                jqrProfile={jqrProfile}
                onFilterTactic={(tacticId) => setTacticFilter(tacticId)}
              />
              <CollapsiblePropertiesPanel
                selectedNode={panelSelectedNode}
                nodes={panelNodes}
                timerLog={executionLog}
                globalSettings={globalSettings}
                onSettingsChange={setGlobalSettings}
                onNodeDataChange={handleNodeDataChange}
                onAddNodeToCanvas={handleAddNodeFromAI}
                availableVariables={availableVariables}
                edges={edges}
                nodeInstances={nodeInstances}
                connectionContext={connectionContext}
                nodeMap={nodeMap}
                infrastructureStatus={infrastructureStatus}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0" ref={reactFlowWrapper}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onDrop={onDrop}
                onDragOver={onDragOver}
                isValidConnection={() => true}
                nodeTypes={nodeTypes}
                defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
                minZoom={0.3}
                maxZoom={1.5}
                snapToGrid
                snapGrid={[15, 15]}
                proOptions={{ hideAttribution: true }}
                className="bg-canvas"
                deleteKeyCode="Delete"
                multiSelectionKeyCode="Shift"
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1}
                  color="hsl(222, 15%, 18%)"
                />
                <Controls
                  className="!bg-panel !border-panel-border !shadow-lg"
                  showZoom={false}
                  showFitView={false}
                />
                <MiniMap
                  nodeColor={node => {
                    const data = node.data as OpforNodeData;
                    switch (data?.definition?.tactic) {
                      case 'TA0001': return 'hsl(210, 100%, 50%)';
                      case 'TA0002': return 'hsl(25, 95%, 53%)';
                      case 'TA0011': return 'hsl(45, 100%, 50%)';
                      case 'control': return 'hsl(200, 80%, 50%)';
                      default:       return 'hsl(222, 15%, 30%)';
                    }
                  }}
                  maskColor="hsla(222, 20%, 8%, 0.8)"
                  className="!bg-panel !border-panel-border"
                />

                {nodes.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center space-y-4 max-w-md px-8">
                      <div className="mb-6 flex justify-center items-center font-mono text-7xl font-black tracking-tighter select-none">
                        <span className="text-zinc-700">&gt;</span>
                        <span className="text-amber-500 animate-pulse">_</span>
                      </div>
                      <h2 className="text-2xl font-mono font-medium uppercase tracking-widest text-white">
                        Awaiting Instructions
                      </h2>
                      <p className="text-zinc-500 text-sm font-mono uppercase tracking-tight">
                        Use the Tactic Library to create your attack chain
                      </p>
                      <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-zinc-600 mt-8 uppercase tracking-[0.2em]">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-500/50">DRAG FROM</span>
                          <span>LIBRARY</span>
                        </div>
                        <span className="opacity-30">|</span>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-500/50">DROP IN</span>
                          <span>CANVAS</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </ReactFlow>
            </div>

            {/* Right panel with JQR panel above properties */}
            <div className="flex flex-col flex-shrink-0" style={{ width: 'auto' }}>
              <JQRPanel
                nodes={nodes}
                jqrProfile={jqrProfile}
                onFilterTactic={(tacticId) => setTacticFilter(tacticId)}
              />
              <CollapsiblePropertiesPanel
                selectedNode={panelSelectedNode}
                nodes={panelNodes}
                timerLog={executionLog}
                globalSettings={globalSettings}
                onSettingsChange={setGlobalSettings}
                onNodeDataChange={handleNodeDataChange}
                onAddNodeToCanvas={handleAddNodeFromAI}
                availableVariables={availableVariables}
                edges={edges}
                nodeInstances={nodeInstances}
                connectionContext={connectionContext}
                nodeMap={nodeMap}
                infrastructureStatus={infrastructureStatus}
              />
            </div>
          </>
        )}
      </div>

      <ExecutionPanel
        isOpen={executionPanelOpen}
        onToggle={() => setExecutionPanelOpen(!executionPanelOpen)}
        onClose={() => setExecutionPanelOpen(false)}
        executionState={executionState}
        onRun={handleRunExecution}
        onStop={handleStopExecution}
        onRerun={handleRerunExecution}
        onHighlightNode={handleHighlightNode}
        scriptContent={generatedScript?.full}
        apiBaseUrl="http://localhost:8001"
      />

      <SaveLoadDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        mode="save"
        currentWorkflow={{ nodes, edges, globalSettings, viewport: getViewport() }}
      />
      <SaveLoadDialog
        open={loadDialogOpen}
        onClose={() => setLoadDialogOpen(false)}
        mode="load"
        onLoad={handleLoadWorkflow}
      />

      {/* ── Readiness check modal — gates export ── */}
      {showReadiness && (
        <ReadinessCheck
          nodes={nodes}
          edges={edges}
          jqrProfile={jqrProfile}
          onConfirm={handleConfirmExport}
          onClose={() => setShowReadiness(false)}
        />
      )}
    </div>
  );
}

export function WorkflowBuilder({ campaign }: { campaign?: CampaignConfig | null }) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner campaign={campaign} />
    </ReactFlowProvider>
  );
}