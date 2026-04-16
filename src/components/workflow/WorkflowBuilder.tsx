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
import { TaggedGroupPatch } from './TaggedGroupHeader';
import { OPERATOR_GROUP_HEADER_H } from './PhaseGroupNode';
import { CollapsiblePropertiesPanel, InfrastructureState } from './CollapsiblePropertiesPanel';
import { Toolbar, ViewMode, LifecycleStage } from './Toolbar';
import { ScriptView } from './ScriptView';
import { SaveLoadDialog } from '../opfor/SaveLoadDialog';
import { OpforNode } from './OpforNode';
// ── ExecutionPanel is now a forwardRef component exposing .execute()/.stop() ──
import { ExecutionPanel } from './ExecutionPanel';
import type { ExecutionPanelHandle } from './ExecutionPanel';
import { OperatorHeader } from './OperatorHeader';
import { JQRPanel } from './JQRPanel';
import { CampaignStatusBar } from './CampaignStatusBar';
import { ReadinessCheck } from './ReadinessCheck';
import {
  PhaseGroupNode,
  PhaseGroupData,
  PILL_W, PILL_H, GROUP_HEADER_H, GROUP_PADDING,
} from './PhaseGroupNode';
import { ArrowConnectorNode } from './ArrowConnectorNode';
import {
  OpforGlobalSettings,
  OpforNodeData,
  OpforNodeDefinition,
  ExecutionLogEntry,
  WorkflowFile,
  CanvasVariable,
  MitreTactic,
} from '@/types/opfor';
import { CampaignConfig } from '@/types/campaign';
import { saveCampaignToIndex } from '@/lib/campaignStorage';
import { useToast } from '@/hooks/use-toast';
import { WorkflowService } from '@/services/workflowService';
import {
  buildNodeInstances,
  buildConnectionContext,
  NodeInstance,
  ConnectionContext,
} from '@/services/nodeInstanceUtils';
import {
  // Real execution — no longer importing simulateWorkflow
  checkInfrastructureStatus,
  type ExecutionState,
  initialExecutionState,
  makeLogLine,
} from '@/services/executionService';
import { generateRobotScript } from '@/services/robotScriptGenerator';
import { GuidedVariation } from '@/data/guidedVariations';
import { libraryModuleService } from '@/services/libraryModuleService';

// Node types registered once outside the component to avoid re-render churn
const nodeTypes = {
  opforNode:      OpforNode,
  phaseGroup:     PhaseGroupNode,
  arrowConnector: ArrowConnectorNode,
};

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
  const [framingMode, setFramingMode] = useState(false);
  const [lifecycleStage, setLifecycleStage] = useState<LifecycleStage>('draft');

  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
  const [globalSettings, setGlobalSettings] = useState<OpforGlobalSettings>({
    // Campaign identity
    executionPlanName: 'Hunt 1',
    targetNetwork:     '',
    sessionId:         'session_01',
    operator:          '',
    redTeam:           '',
    notes:             '',
    // C2 teamserver
    c2Server:  '202.84.73.4',
    csUser:    'bah',
    csPass:    '',
    csDir:     '/opt/cobaltstrike',
    csPort:    '50050',
    // Operator environment
    workdir:    '%{HOME}/sandworm/',
    debugMode:  '${False}',
    sudoNeeded: '${False}',
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

  // ── JQR profile derived from campaign ─────────────────────────────────────
  const jqrProfile = campaign?.jqrProfile ?? null;

  // ── Restore canvas from saved campaign state on mount ─────────────────────
  useEffect(() => {
    if (!campaign) return;
    if (campaign.canvasNodes && (campaign.canvasNodes as Node[]).length > 0) {
      setNodes(campaign.canvasNodes as Node[]);
      hasInitialNode.current = true;
    }
    if (campaign.canvasEdges && (campaign.canvasEdges as Edge[]).length > 0) {
      setEdges(campaign.canvasEdges as Edge[]);
    }
  }, []); // run once on mount only

  // ── Rehydrate onToggleCollapse after campaign canvas restore ─────────────
  useEffect(() => {
    setNodes(nds => nds.map(n => {
      if (n.type !== 'phaseGroup') return n;
      return {
        ...n,
        data: {
          ...n.data,
          onToggleCollapse: (id: string) => toggleCollapseRef.current(id),
        },
      };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save canvas state to campaign record on unmount ────────────────────────
  useEffect(() => {
    return () => {
      if (!campaign || nodes.length === 0) return;
      const tacticsCovered = [
        ...new Set(
          nodes
            .map(n => (n.data as OpforNodeData).definition?.tactic)
            .filter(Boolean) as string[]
        ),
      ];
      const required    = campaign.jqrProfile?.requiredTactics ?? [];
      const covered     = required.filter(t => tacticsCovered.includes(t)).length;
      const jqrProgress = required.length > 0
        ? Math.round((covered / required.length) * 100)
        : 0;
      saveCampaignToIndex({
        ...campaign,
        canvasNodes:    nodes,
        canvasEdges:    edges,
        nodeCount:      nodes.length,
        tacticsCovered,
        jqrProgress,
        updatedAt:      new Date().toISOString(),
      });
    };
  }, [nodes, edges, campaign]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tactic filter ─────────────────────────────────────────────────────────
  const [tacticFilter, setTacticFilter] = useState<string | null>(null);

  // ── Readiness check modal ─────────────────────────────────────────────────
  const [showReadiness, setShowReadiness] = useState(false);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);

  // ==========================================================================
  // EXECUTION STATE
  // ExecutionPanel owns the terminal WebSocket and all RF output.
  // WorkflowBuilder only needs to know: is the panel open, and what's the
  // last known execution state (for the header status dot + toolbar button).
  // ==========================================================================
  const [executionPanelOpen, setExecutionPanelOpen] = useState(false);

  // ── Execution state for header / toolbar display ──────────────────────────
  // ExecutionPanel manages its own internal running state via TerminalView.
  // We mirror the high-level status here so OperatorHeader and Toolbar can
  // show a green/amber/red dot without needing direct terminal access.
  const [executionState, setExecutionState] = useState<ExecutionState>(initialExecutionState);

  // ── ref to the ExecutionPanel so we can call .execute() from the toolbar ──
  const executionPanelRef = useRef<ExecutionPanelHandle>(null);

  // ── InfrastructureState kept in sync with real backend ───────────────────
  const [infrastructureStatus, setInfrastructureStatus] = useState<InfrastructureState>({
    c2Connected:    false,
    robotAvailable: false,
    listeners:      [],
    payloads:       [],
  });

  // Poll every 8 s — lightweight GET, just status booleans
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await checkInfrastructureStatus('http://localhost:8001');
        setInfrastructureStatus({
          c2Connected:    s.c2Connected,
          c2Host:         s.teamserverHost,
          robotAvailable: s.robotAvailable,
          listeners:      s.listeners,
          payloads:       s.payloads,
        });
      } catch {
        // Server unreachable — keep last known state, don't spam console
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, []);

  // ==========================================================================
  // GENERATED ROBOT SCRIPT
  // Must be declared BEFORE handleRunExecution to avoid temporal dead zone.
  // Recomputed any time nodes/edges/settings change.
  // Passed to ExecutionPanel as scriptContent — visible in Script tab and
  // used by the Execute button.
  // ==========================================================================
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

  // ==========================================================================
  // EXECUTION HANDLERS
  // The Execute button / Ctrl+Enter calls handleRunExecution.
  // That opens the panel and forwards the generated .robot script to
  // executionPanelRef.current.execute() — which creates the terminal session
  // (with CS credential injection) and opens the WebSocket stream.
  // ==========================================================================

  const handleRunExecution = useCallback(() => {
    if (!generatedScript?.full) {
      toast({
        title: 'No script',
        description: 'Add nodes to the canvas to generate a script.',
        variant: 'destructive',
      });
      return;
    }

    setExecutionPanelOpen(true);
    setExecutionState(prev => ({
      ...prev,
      status: 'running',
      startedAt: new Date(),
      completedAt: undefined,
      logs: [...prev.logs, makeLogLine('info', `Executing: ${globalSettings.executionPlanName}`)],
    }));

    // Delegate everything to ExecutionPanel — it owns the WebSocket lifecycle.
    // We use setTimeout(0) so the panel has a render cycle to mount TerminalView
    // before we call into it.
    setTimeout(() => {
      executionPanelRef.current?.execute(generatedScript.full);
    }, 0);
  }, [generatedScript, globalSettings.executionPlanName, toast]);

  const handleStopExecution = useCallback(() => {
    executionPanelRef.current?.stop();
    setExecutionState(prev => ({
      ...prev,
      status: 'stopped',
      completedAt: new Date(),
    }));
  }, []);

  const handleRerunExecution = useCallback(() => {
    setExecutionState(initialExecutionState);
    // Brief delay so state resets before execute fires
    setTimeout(handleRunExecution, 50);
  }, [handleRunExecution]);

  // Mirror terminal exit code back up to WorkflowBuilder state
  const handleExecutionComplete = useCallback((exitCode: number) => {
    setExecutionState(prev => ({
      ...prev,
      status: exitCode === 0 ? 'completed' : 'failed',
      completedAt: new Date(),
      progress: exitCode === 0 ? 100 : prev.progress,
      logs: [
        ...prev.logs,
        makeLogLine(
          exitCode === 0 ? 'success' : 'error',
          exitCode === 0
            ? 'Robot Framework completed successfully'
            : `Robot Framework exited with code ${exitCode}`,
        ),
      ],
    }));

    // Update node visual states from RF output
    if (exitCode === 0) {
      setNodes(nds =>
        nds.map(n => ({
          ...n,
          data: {
            ...n.data,
            validationState: n.data?.validationState === 'executing' ? 'success' : n.data?.validationState,
          },
        }))
      );
    }
  }, [setNodes]);

  // ==========================================================================
  // NODE INSTANCES & CONNECTION CONTEXT
  // ==========================================================================
  const nodeInstances = useMemo((): Map<string, NodeInstance> => {
    return buildNodeInstances(nodes);
  }, [nodes]);

  const connectionContext = useMemo((): ConnectionContext => {
    return buildConnectionContext(edges);
  }, [edges]);

  const nodeMap = useMemo((): Map<string, Node> => {
    return new Map(nodes.map(n => [n.id, n]));
  }, [nodes]);

  // ==========================================================================
  // CANVAS VARIABLES
  // ==========================================================================
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

        if (campaign) {
          const tacticsCovered = [
            ...new Set(
              nodes
                .map(n => (n.data as OpforNodeData).definition?.tactic)
                .filter(Boolean) as string[]
            ),
          ];
          const required    = campaign.jqrProfile?.requiredTactics ?? [];
          const covered     = required.filter(t => tacticsCovered.includes(t)).length;
          const jqrProgress = required.length > 0
            ? Math.round((covered / required.length) * 100)
            : 0;
          saveCampaignToIndex({
            ...campaign,
            canvasNodes:    nodes,
            canvasEdges:    edges,
            nodeCount:      nodes.length,
            tacticsCovered,
            jqrProgress,
            updatedAt:      new Date().toISOString(),
          });
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [nodes, edges, globalSettings, getViewport, campaign]);

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

  // ── Ctrl+Enter global shortcut — execute from anywhere ───────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;
      e.preventDefault();
      handleRunExecution();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleRunExecution]);

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

  // ==========================================================================
  // PHASE GROUP COLLAPSE
  // ==========================================================================
  const handleToggleCollapse = useCallback((groupId: string) => {
    const group = nodes.find(n => n.id === groupId);
    if (!group) return;

    const gData        = group.data as PhaseGroupData;
    const willCollapse = !gData.collapsed;
    const childIds     = new Set(gData.childNodeIds);
    const newW = willCollapse ? PILL_W  : gData.expandedWidth;
    const newH = willCollapse ? PILL_H  : gData.expandedHeight + GROUP_HEADER_H + GROUP_PADDING;

    setNodes(nds => nds.map(n => {
      if (n.id === groupId) {
        return {
          ...n,
          width:  newW,
          height: newH,
          style:  { ...((n.style as object) || {}), width: newW, height: newH },
          data:   { ...n.data, collapsed: willCollapse },
        };
      }
      if (childIds.has(n.id)) {
        return { ...n, hidden: willCollapse };
      }
      return n;
    }));

    setEdges(eds => eds.map(e => {
      const srcIsChild = childIds.has(e.source);
      const tgtIsChild = childIds.has(e.target);
      if (srcIsChild || tgtIsChild) {
        if (e.id.startsWith('edge-inter-')) return e;
        return { ...e, hidden: willCollapse };
      }
      return e;
    }));
  }, [nodes, setNodes, setEdges]);

  const toggleCollapseRef = useRef(handleToggleCollapse);
  useEffect(() => { toggleCollapseRef.current = handleToggleCollapse; }, [handleToggleCollapse]);

  const handleUpdateTag = useCallback((groupId: string, patch: TaggedGroupPatch) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== groupId) return n;
      return { ...n, data: { ...n.data, ...patch } };
    }));
  }, [setNodes]);

  const updateTagRef = useRef(handleUpdateTag);
  useEffect(() => { updateTagRef.current = handleUpdateTag; }, [handleUpdateTag]);

  const handleContainerizeSelected = useCallback((selectedIds: string[]) => {
    setFramingMode(false);

    const contained = nodes.filter(n =>
      selectedIds.includes(n.id) &&
      n.type === 'opforNode' &&
      !n.hidden &&
      !n.parentId
    );

    if (contained.length === 0) return;

    const ts      = Date.now();
    const groupId = `operator-group-${ts}`;
    const childIds = contained.map(n => n.id);

    const pad  = GROUP_PADDING;
    const minX = Math.min(...contained.map(n => n.position.x)) - pad;
    const minY = Math.min(...contained.map(n => n.position.y)) - OPERATOR_GROUP_HEADER_H - pad;
    const maxX = Math.max(...contained.map(n => n.position.x + (n.width  ?? 160))) + pad;
    const maxY = Math.max(...contained.map(n => n.position.y + (n.height ?? 72)))  + pad;

    const expW = maxX - minX;
    const expH = maxY - minY - OPERATOR_GROUP_HEADER_H + GROUP_PADDING;

    const childTtpIds = contained.flatMap(n => {
      const def = (n.data as OpforNodeData).definition;
      return def?.mitre?.techniqueId ? [def.mitre.techniqueId] : [];
    });

    const groupNode: Node = {
      id:       groupId,
      type:     'phaseGroup',
      position: { x: minX, y: minY },
      width:    expW,
      height:   expH + OPERATOR_GROUP_HEADER_H + GROUP_PADDING,
      style:    { width: expW, height: expH + OPERATOR_GROUP_HEADER_H + GROUP_PADDING },
      data: {
        groupId,
        phaseLabel:          'Initial Access',
        phaseId:             'TA0001',
        variationName:       '',
        stepCount:           contained.length,
        childNodeIds:        childIds,
        collapsed:           false,
        expandedWidth:       expW,
        expandedHeight:      expH,
        source:              'operator',
        difficulty:          'Standard',
        ksaIds:              [],
        jqsIds:              [],
        narrative:           '',
        contributionStatus:  'draft',
        childTtpIds,
        onToggleCollapse: (id: string) => toggleCollapseRef.current(id),
        onUpdateTag:      (id: string, patch: TaggedGroupPatch) => updateTagRef.current(id, patch),
      } as PhaseGroupData,
      selectable: true,
      draggable:  true,
    };

    setNodes(nds => {
      const updated = nds.map(n => {
        if (!childIds.includes(n.id)) return n;
        return {
          ...n,
          parentId: groupId,
          extent:   'parent' as const,
          selected: false,
          position: {
            x: n.position.x - minX,
            y: n.position.y - minY,
          },
        };
      });
      return [groupNode, ...updated];
    });

    addLogEntry('update', `Operator frame: ${contained.length} nodes containerized`, 'Set tactic, difficulty, and KSA/JQS in the container header');
  }, [nodes, setNodes, addLogEntry, toggleCollapseRef]);

  // ==========================================================================
  // GUIDED VARIATION PLACEMENT
  // ==========================================================================
  const handleSelectVariation = useCallback(
    (variation: GuidedVariation) => {
      const viewport = getViewport();

      const CHILD_NODE_W   = 160;
      const CHILD_NODE_H   = 72;
      const CHILD_GAP_X    = 40;
      const LANE_GAP_Y     = 48;

      const currentNodes = nodes;
      const currentEdges = edges;

      const existingGroups = currentNodes.filter(n => n.type === 'phaseGroup');
      const tailGroup = existingGroups.length > 0
        ? existingGroups.reduce((b, n) => n.position.y > b.position.y ? n : b, existingGroups[0])
        : null;

      const nodesWithOutgoing = new Set(currentEdges.map(e => e.source));
      const orphanTails = currentNodes.filter(n =>
        n.type === 'opforNode' &&
        !nodesWithOutgoing.has(n.id) &&
        !n.hidden,
      );
      const prevTailOpfor = orphanTails.length > 0
        ? orphanTails.reduce((b, n) => n.position.x > b.position.x ? n : b, orphanTails[0])
        : null;

      let groupX: number;
      let groupY: number;

      if (tailGroup) {
        const tgData = tailGroup.data as PhaseGroupData;
        const tgH = tgData.collapsed
          ? PILL_H
          : tgData.expandedHeight + GROUP_HEADER_H + GROUP_PADDING;
        groupX = tailGroup.position.x;
        groupY = tailGroup.position.y + tgH + LANE_GAP_Y;
      } else {
        groupX = -viewport.x / viewport.zoom + 60;
        groupY = -viewport.y / viewport.zoom + 80;
      }

      const n          = variation.steps.length;
      const expandedW  = n * CHILD_NODE_W + (n - 1) * CHILD_GAP_X + GROUP_PADDING * 2;
      const expandedH  = CHILD_NODE_H + GROUP_PADDING * 2;
      const totalH     = expandedH + GROUP_HEADER_H + GROUP_PADDING;

      const ts       = Date.now();
      const groupId  = `phase-group-${variation.phaseId}-${ts}`;
      const childIds = variation.steps.map((s, i) => `${s.moduleKey}-${ts}-${i}`);

      const groupNode: Node = {
        id:       groupId,
        type:     'phaseGroup',
        position: { x: groupX, y: groupY },
        width:    expandedW,
        height:   totalH,
        style:    { width: expandedW, height: totalH },
        data: {
          groupId,
          phaseLabel:    variation.phase,
          phaseId:       variation.phaseId,
          variationName: variation.name,
          stepCount:     variation.steps.length,
          childNodeIds:  childIds,
          collapsed:     false,
          expandedWidth:  expandedW,
          expandedHeight: expandedH,
          source:        'guided',
          onToggleCollapse: (id: string) => toggleCollapseRef.current(id),
        } as PhaseGroupData,
        selectable: true,
        draggable:  true,
      };

      const withTriggerHandles = (def: OpforNodeDefinition): OpforNodeDefinition => {
        const TRIGGER_IN  = { id: 'trigger-in',  label: 'Trigger', type: 'trigger', required: true,  description: '' };
        const TRIGGER_OUT = { id: 'trigger-out', label: 'Next',    type: 'trigger', required: false, description: '' };
        const inputs  = [TRIGGER_IN,  ...(def.inputs  || []).filter(p => p.id !== 'trigger-in')];
        const outputs = [TRIGGER_OUT, ...(def.outputs || []).filter(p => p.id !== 'trigger-out')];
        return { ...def, inputs, outputs };
      };

      const childNodes: Node[] = variation.steps.map((step, index) => {
        const resolved = (step as any)._resolvedDefinition as OpforNodeDefinition | undefined;

        const definition: OpforNodeDefinition = resolved
          ? {
              ...withTriggerHandles(ensureSafeNodeDef(resolved)),
              mitre: { tacticId: step.tactic, techniqueId: step.ttpId },
            }
          : {
              ...(console.warn(
                `[handleSelectVariation] No resolved definition for "${step.moduleKey}" — using stub.`
              ), {}),
              id:                  step.moduleKey,
              _key:                step.moduleKey,
              name:                step.displayName,
              icon:                step.icon,
              tactic:              (step.tactic as MitreTactic) || 'control',
              category:            variation.phase,
              subcategory:         '',
              description:         `${step.ttpId} — ${step.ttpName}`,
              riskLevel:           'medium',
              estimatedDuration:   30,
              executionType:       'cobalt_strike',
              cobaltStrikeCommand: null,
              robotKeyword:        null,
              robotTemplate:       null,
              robotLibrary:        null,
              shellCommand:        null,
              inputs:  [{ id: 'trigger-in',  label: 'Trigger', type: 'trigger', required: true,  description: '' }],
              outputs: [{ id: 'trigger-out', label: 'Next',    type: 'trigger', required: false, description: '' }],
              parameters:   [],
              requirements: { c2Server: false, listeners: [], payloads: [], sshConnections: [], externalTools: [], libraries: [] },
              metadata:     { version: '1.0', lastUpdated: '', updatedBy: '', validationStatus: 'draft', changeLog: '', owner: '', status: 'active', tags: [] },
              outputObjects: [],
              mitre: { tacticId: step.tactic, techniqueId: step.ttpId },
            };

        const initialParams: Record<string, string | number> = {};
        definition.parameters?.forEach(param => {
          if (param.default !== undefined) initialParams[param.id] = param.default;
        });

        return {
          id:       childIds[index],
          type:     'opforNode',
          parentId: groupId,
          extent:   'parent' as const,
          position: {
            x: GROUP_PADDING + index * (CHILD_NODE_W + CHILD_GAP_X),
            y: GROUP_HEADER_H + GROUP_PADDING,
          },
          data: {
            definition,
            parameters:      initialParams,
            label:           step.displayName,
            validationState: 'unconfigured',
          } as OpforNodeData,
        };
      });

      const newEdges: Edge[] = [];

      childIds.forEach((id, i) => {
        if (i === 0) return;
        newEdges.push({
          id:           `edge-${childIds[i-1]}-${id}`,
          source:       childIds[i-1],
          target:       id,
          sourceHandle: 'trigger-out',
          targetHandle: 'trigger-in',
          animated:     true,
          style:        { stroke: 'hsl(210, 100%, 50%)', strokeWidth: 2 },
        });
      });

      if (prevTailOpfor) {
        newEdges.push({
          id:           `edge-inter-${prevTailOpfor.id}-${childIds[0]}`,
          source:       prevTailOpfor.id,
          target:       childIds[0],
          sourceHandle: 'trigger-out',
          targetHandle: 'trigger-in',
          animated:     false,
          hidden:       true,
          type:         'smoothstep',
          style:        { stroke: 'hsl(210, 60%, 60%)', strokeWidth: 1.5 },
        });
      }

      const extraNodes: Node[] = [];
      if (tailGroup) {
        const tgData = tailGroup.data as PhaseGroupData;
        const tgH    = tgData.collapsed
          ? PILL_H
          : tgData.expandedHeight + GROUP_HEADER_H + GROUP_PADDING;

        const arrowId = `arrow-connector-${tailGroup.id}-${groupId}`;
        const arrowX  = groupX + PILL_W / 2 - 10;
        const arrowY  = tailGroup.position.y + tgH + LANE_GAP_Y / 2 - 10;

        extraNodes.push({
          id:        arrowId,
          type:      'arrowConnector',
          position:  { x: arrowX, y: arrowY },
          draggable: false,
          selectable: false,
          data:      {},
        });
      }

      setNodes(nds => [...nds, groupNode, ...extraNodes, ...childNodes]);
      setEdges(eds => [...eds, ...newEdges]);

      addLogEntry(
        'update',
        `Guided: placed "${variation.name}"`,
        `${variation.steps.length} steps · ${variation.phase}`,
      );

      toast({
        title: '✓ Variation placed',
        description: `${variation.name} · ${variation.steps.length} nodes`,
      });

      if (!hasInitialNode.current) hasInitialNode.current = true;
      setTimeout(() => fitView({ padding: 0.2 }), 80);
    },
    [nodes, edges, getViewport, setNodes, setEdges, addLogEntry, toast, fitView, ensureSafeNodeDef],
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
    async (event: React.DragEvent) => {
      event.preventDefault();
      const nodeDataString = event.dataTransfer.getData('application/json');
      if (!nodeDataString) return;

      let nodeDef: OpforNodeDefinition;
      try {
        nodeDef = JSON.parse(nodeDataString);
      } catch {
        return;
      }

      const moduleKey = nodeDef._key || nodeDef.id;
      try {
        const payload = await libraryModuleService.getModulePayload(moduleKey);
        if (payload) {
          nodeDef = { ...nodeDef, ...payload, _key: nodeDef._key, id: nodeDef.id };
        }
      } catch (e) {
        console.warn(`Could not fetch payload for ${moduleKey} — using metadata only`, e);
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

  const handleHighlightNode = useCallback(
    (nodeId: string | null) => {
      setNodes(nds => nds.map(n => ({ ...n, selected: n.id === nodeId })));
    },
    [setNodes]
  );

  const handleSimulate = useCallback(() => handleRunExecution(), [handleRunExecution]);

  // ── Export ────────────────────────────────────────────────────────────────
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
    setExecutionState(initialExecutionState);
    hasInitialNode.current = false;
    setInfrastructureStatus({
      c2Connected: false,
      robotAvailable: false,
      listeners: [],
      payloads: [],
    });
    addLogEntry('update', 'Canvas reset');
    toast({ title: 'Canvas Reset' });
  }, [setNodes, setEdges, addLogEntry, toast]);

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
    () => nodes
      .filter(n => n.type === 'opforNode')
      .map(n => ({ id: n.id, data: n.data as OpforNodeData })),
    [nodes]
  );

  const panelSelectedNode = useMemo(
    () =>
      selectedNode && selectedNode.type === 'opforNode'
        ? { id: selectedNode.id, data: selectedNode.data as OpforNodeData }
        : null,
    [selectedNode]
  );

  const taggedGroupCount = nodes.filter(n =>
    n.type === 'phaseGroup' &&
    (n.data as { source?: string; contributionStatus?: string }).source === 'operator' &&
    (n.data as { contributionStatus?: string }).contributionStatus === 'ready'
  ).length;

  const isScriptView = viewMode === 'script';

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">

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
        onSave={() => setSaveDialogOpen(true)}
        onLoad={() => setLoadDialogOpen(true)}
        nodes={nodes}
        jqrProfile={jqrProfile}
        onFilterTactic={(tacticId) => setTacticFilter(tacticId)}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Left: Tactic Library ── */}
        <div className="w-72 border-r border-panel-border flex-shrink-0">
          <NodePalette
            onDragStart={onDragStart}
            onSelectVariation={handleSelectVariation}
            tacticFilter={tacticFilter}
            onClearTacticFilter={() => setTacticFilter(null)}
            framingMode={framingMode}
            onToggleFramingMode={() => setFramingMode(f => !f)}
            selectedNodeIds={framingMode
              ? nodes.filter(n => n.selected && n.type === 'opforNode' && !n.parentId).map(n => n.id)
              : []
            }
            onContainerizeSelected={handleContainerizeSelected}
          />
        </div>

        {isScriptView ? (
          <div className="flex-1 flex min-w-0">
            <div className="flex-1 min-w-0">
              <ScriptView nodes={nodes} edges={edges} globalSettings={globalSettings} />
            </div>

            <div className="flex flex-col flex-shrink-0" style={{ width: 'auto' }}>
              <CampaignStatusBar
                lifecycleStage={lifecycleStage}
                onLifecycleChange={setLifecycleStage}
                nodes={nodes}
                jqrProfile={jqrProfile}
                onFilterTactic={(tacticId) => setTacticFilter(tacticId)}
                taggedGroupCount={taggedGroupCount}
                onPublish={() => {
                  addLogEntry('export', 'Published to ProtoGraph', `${taggedGroupCount} variation(s) synced`);
                  toast({ title: '🚀 Published', description: `${taggedGroupCount} variation(s) sent to ProtoGraph` });
                }}
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
            <div className="flex-1 min-w-0 relative" ref={reactFlowWrapper}>
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
                selectionOnDrag={false}
                panOnDrag={!framingMode}
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

            <div className="flex flex-col flex-shrink-0" style={{ width: 'auto' }}>
              <CampaignStatusBar
                lifecycleStage={lifecycleStage}
                onLifecycleChange={setLifecycleStage}
                nodes={nodes}
                jqrProfile={jqrProfile}
                onFilterTactic={(tacticId) => setTacticFilter(tacticId)}
                taggedGroupCount={taggedGroupCount}
                onPublish={() => {
                  addLogEntry('export', 'Published to ProtoGraph', `${taggedGroupCount} variation(s) synced`);
                  toast({ title: '🚀 Published', description: `${taggedGroupCount} variation(s) sent to ProtoGraph` });
                }}
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

      {/* ── Execution Panel — real terminal, forwardRef for .execute()/.stop() ── */}
      <ExecutionPanel
        ref={executionPanelRef}
        isOpen={executionPanelOpen}
        onToggle={() => setExecutionPanelOpen(!executionPanelOpen)}
        onClose={() => setExecutionPanelOpen(false)}
        executionState={executionState}
        onRun={handleRunExecution}
        onStop={handleStopExecution}
        onRerun={handleRerunExecution}
        onHighlightNode={handleHighlightNode}
        scriptContent={generatedScript?.full ?? ''}
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