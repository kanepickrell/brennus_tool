// src/components/workflow/PropertiesPanel.tsx
// Properties panel with dynamic parameter options and connection-aware variable resolution

import { useState, useEffect, useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';
import { 
  Settings, 
  FileText, 
  Clock, 
  Cog, 
  CheckCircle2, 
  AlertTriangle,
  Info,
  Shield,
  Terminal,
  Link2,
  Unlink,
  ArrowRight,
  Target,
} from 'lucide-react';
import { 
  OpforNodeData, 
  ExecutionLogEntry, 
  OpforGlobalSettings, 
  MitreTactic, 
  NodeParameter, 
  tacticLabels,
  CanvasVariable,
  DynamicOptions,
} from '@/types/opfor';
import { 
  NodeInstance, 
  ConnectionContext, 
  resolveVariableReference,
  ResolvedVariable,
} from '@/services/nodeInstanceUtils';
import { collectTargetSuggestions } from '@/services/variableResolution';
import { RangeTargetInspector } from './RangeTargetInspector';
import type { RangeTargetData } from '@/types/opforRangeTarget';
import { cn } from '@/lib/utils';

interface FlowNode {
  id: string;
  type?: string;
  data: OpforNodeData | RangeTargetData;
}

interface PropertiesPanelProps {
  selectedNode: FlowNode | null;
  nodes: FlowNode[];
  timerLog: ExecutionLogEntry[];
  globalSettings: OpforGlobalSettings;
  onSettingsChange: (settings: OpforGlobalSettings) => void;
  onNodeDataChange?: (nodeId: string, data: any) => void;
  onNodeDelete?: (nodeId: string) => void;
  activeTab?: 'properties' | 'instructions' | 'log' | 'settings';
  /** Available variables from canvas for dynamic options */
  availableVariables?: Record<string, CanvasVariable>;
  /** Canvas edges for connection-aware resolution */
  edges?: Edge[];
  /** Node instance tracking */
  nodeInstances?: Map<string, NodeInstance>;
  /** Connection context for variable resolution */
  connectionContext?: ConnectionContext;
  /** Map of node IDs to nodes */
  nodeMap?: Map<string, Node>;
}

const tacticBadgeStyles: Record<MitreTactic, string> = {
  'TA0001': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'TA0002': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'TA0003': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'TA0004': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'TA0005': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'TA0006': 'bg-red-500/20 text-red-400 border-red-500/30',
  'TA0007': 'bg-green-500/20 text-green-400 border-green-500/30',
  'TA0008': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'TA0009': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'TA0010': 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  'TA0011': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'control': 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

// ============================================================================
// Dynamic Options Helper
// ============================================================================

interface DynamicOption {
  label: string;
  value: string;
  sourceNode?: string;
  isVariable?: boolean;
}

function getDynamicOptions(
  dynamicOptions: DynamicOptions,
  availableVariables: Record<string, CanvasVariable>,
  currentNodeId: string
): DynamicOption[] {
  const options: DynamicOption[] = [];

  if (dynamicOptions.fallback === 'none') {
    options.push({ label: '(None)', value: '__none__' });
  }

  if (dynamicOptions.sourceType === 'canvasVariable' && dynamicOptions.variablePattern) {
    const pattern = dynamicOptions.variablePattern.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`, 'i');

    Object.entries(availableVariables).forEach(([varName, varInfo]) => {
      if (varInfo.sourceNodeId === currentNodeId) return;

      if (regex.test(varName)) {
        options.push({
          label: `\${${varName}} (${varInfo.value}) — from ${varInfo.sourceNodeName}`,
          value: `\${${varName}}`,
          sourceNode: varInfo.sourceNodeName,
          isVariable: true,
        });
      }
    });
  }

  return options;
}

// ============================================================================
// Parameter Input Component with Connection-Aware Resolution Display
// ============================================================================

function ParameterInput({ 
  param, 
  value, 
  onChange,
  availableVariables = {},
  currentNodeId,
  resolvedVariable,
  isInherited = false,
  allNodes = [],
  connectionContext,
}: { 
  param: NodeParameter; 
  value: string | number | undefined; 
  onChange: (value: string | number) => void;
  availableVariables?: Record<string, CanvasVariable>;
  currentNodeId: string;
  resolvedVariable?: ResolvedVariable;
  isInherited?: boolean;
  allNodes?: FlowNode[];
  connectionContext?: ConnectionContext;
}) {
  const dynamicOptions = useMemo(() => {
    if (!param.dynamicOptions || !currentNodeId) return null;
    return getDynamicOptions(param.dynamicOptions, availableVariables, currentNodeId);
  }, [param.dynamicOptions, availableVariables, currentNodeId]);

  // Target Suggestions Injection
  const targetSuggestions = useMemo(() => {
    if (!connectionContext || !currentNodeId) return [];
    // Extract identifier from ${VAR_NAME} -> VAR_NAME
    const paramDefaultVariable = typeof param.default === 'string'
      ? param.default.replace(/^\${|}$/g, '')
      : undefined;
    
    if (!paramDefaultVariable) return [];

    return collectTargetSuggestions(
      currentNodeId,
      paramDefaultVariable,
      allNodes as any[],
      connectionContext
    );
  }, [currentNodeId, param.default, allNodes, connectionContext]);

  const targetsOnCanvas = useMemo(() => 
    allNodes.filter(n => n.type === 'rangeTargetNode').length, 
  [allNodes]);

  const hasDynamicOptions = (dynamicOptions && dynamicOptions.length > 0) || targetSuggestions.length > 0;
  const hasStaticOptions = param.options && param.options.length > 0;

  // Check if this value is a variable that got resolved
  const isResolved = resolvedVariable?.wasResolved === true;
  const strValue = String(value ?? '');
  const isVariableRef = strValue.startsWith('${') && strValue.endsWith('}');

  // If inherited from connection, show read-only display
  if (isInherited && isResolved) {
    return (
      <div className="space-y-1">
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md",
          "bg-emerald-500/10 border border-emerald-500/30"
        )}>
          <Link2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-mono text-emerald-400 block truncate">
              {resolvedVariable.resolved}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-500/70 pl-1">
          <ArrowRight className="h-3 w-3" />
          <span>Inherited from {resolvedVariable.sourceNodeName}</span>
        </div>
      </div>
    );
  }

  // Combine dynamic + static options for select
  if (param.type === 'select' || hasDynamicOptions) {
    const allOptions: DynamicOption[] = [];

    if (dynamicOptions) {
      allOptions.push(...dynamicOptions);
    }

    if (hasStaticOptions) {
      if (allOptions.length > 0) {
        allOptions.push({ label: '── Manual Options ──', value: '__separator__' });
      }
      param.options!.forEach(opt => {
        allOptions.push({ label: opt, value: opt });
      });
    }

    if (param.dynamicOptions?.allowManualEntry) {
      allOptions.push({ label: '── Enter Manually ──', value: '__manual__' });
    }

    const noOptionsFound = allOptions.length === 0 || (allOptions.length === 1 && allOptions[0].value === '__none__');

    if (noOptionsFound && targetSuggestions.length === 0) {
      return (
        <div className="p-2 rounded-md bg-zinc-800/50 border border-zinc-700 text-xs text-zinc-500 italic">
          <div className="flex items-center gap-2">
            <Unlink className="h-3 w-3" />
            {param.dynamicOptions?.emptyMessage || 'No options available — add upstream nodes'}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <Select 
          value={value?.toString() || param.default?.toString() || ''} 
          onValueChange={(val) => {
            if (val === '__separator__') return;
            onChange(val === '__none__' ? '' : val);
          }}
        >
          <SelectTrigger className={cn(
            "bg-sidebar-accent border-sidebar-border h-8 text-xs",
            isResolved && "border-emerald-500/50 bg-emerald-500/10"
          )}>
            <SelectValue placeholder={param.placeholder || 'Select...'}>
              {isVariableRef ? (
                <span className="flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-cyan-400" />
                  <span className="text-cyan-400 font-mono">{value}</span>
                </span>
              ) : (
                value?.toString() || param.placeholder || 'Select...'
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {/* Target suggestions grouped at the top */}
            {targetSuggestions.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase text-emerald-500/70 px-2 py-1 flex items-center gap-1">
                  <Target className="h-3 w-3" /> From connected targets
                </SelectLabel>
                {targetSuggestions.map((s) => (
                  <SelectItem 
                    key={`${s.targetNodeId}-${s.fieldId}`} 
                    value={s.reference}
                    className="text-xs text-emerald-400 font-mono"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="opacity-70">{s.targetIcon}</span>
                      <span>{s.targetName}</span>
                      <ArrowRight className="h-2 w-2 opacity-50" />
                      <span className="opacity-70">{s.fieldLabel}:</span>
                      <span>{s.displayValue}</span>
                    </span>
                  </SelectItem>
                ))}
                <SelectSeparator />
              </SelectGroup>
            )}

            {allOptions.map((opt, idx) => (
              <SelectItem 
                key={`${opt.value}-${idx}`} 
                value={opt.value}
                disabled={opt.value === '__separator__'}
                className={cn(
                  "text-xs",
                  opt.value === '__separator__' && "text-zinc-500 text-[10px] cursor-default",
                  opt.isVariable && "text-cyan-400"
                )}
              >
                {opt.isVariable ? (
                  <span className="flex items-center gap-1.5">
                    <Link2 className="h-3 w-3" />
                    {opt.label}
                  </span>
                ) : (
                  opt.label
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Show resolved value */}
        {isResolved && (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 pl-1">
            <ArrowRight className="h-3 w-3" />
            <span className="font-mono">{resolvedVariable.resolved}</span>
            <span className="text-zinc-500">from {resolvedVariable.sourceNodeName}</span>
          </div>
        )}

        {/* No targets wired hint */}
        {!value && targetsOnCanvas > 0 && targetSuggestions.length === 0 && (
          <p className="text-[10px] text-slate-400 italic mt-1 px-1">
            {targetsOnCanvas} target{targetsOnCanvas === 1 ? '' : 's'} on canvas —
            wire one to <code className="text-emerald-500/80">target-in</code> for suggestions.
          </p>
        )}
      </div>
    );
  }

  if (param.type === 'text') {
    return (
      <div className="space-y-1">
        <Textarea
          value={value?.toString() || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={param.placeholder}
          className={cn(
            "bg-sidebar-accent border-sidebar-border text-xs min-h-[60px] font-mono",
            isResolved && "border-emerald-500/50 bg-emerald-500/10"
          )}
        />
        {isResolved && (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 pl-1">
            <ArrowRight className="h-3 w-3" />
            <span className="font-mono">{resolvedVariable.resolved}</span>
            <span className="text-zinc-500">from {resolvedVariable.sourceNodeName}</span>
          </div>
        )}
      </div>
    );
  }

  if (param.type === 'number') {
    return (
      <Input
        type="number"
        value={value?.toString() || ''}
        onChange={e => onChange(parseInt(e.target.value) || 0)}
        placeholder={param.placeholder}
        className="bg-sidebar-accent border-sidebar-border h-8 text-xs font-mono"
      />
    );
  }

  // Default string input with resolution display
  return (
    <div className="space-y-1">
      <Input
        type="text"
        value={value?.toString() || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={param.placeholder}
        className={cn(
          "bg-sidebar-accent border-sidebar-border h-8 text-xs font-mono",
          isVariableRef && !isResolved && "border-cyan-500/50 bg-cyan-500/10 text-cyan-400",
          isResolved && "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
        )}
      />
      {/* Show resolved value when connected */}
      {isResolved && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 pl-1">
          <ArrowRight className="h-3 w-3" />
          <span className="font-mono">{resolvedVariable.resolved}</span>
          <span className="text-zinc-500">from {resolvedVariable.sourceNodeName}</span>
        </div>
      )}
      {/* Show unlinked warning when variable ref but not connected */}
      {isVariableRef && !isResolved && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-400 pl-1">
          <Unlink className="h-3 w-3" />
          <span>Not connected — will use template value</span>
        </div>
      )}
      {/* No targets wired hint */}
      {!value && targetsOnCanvas > 0 && targetSuggestions.length === 0 && (
        <p className="text-[10px] text-slate-400 italic mt-1 px-1">
          {targetsOnCanvas} target{targetsOnCanvas === 1 ? '' : 's'} on canvas —
          wire one to <code className="text-emerald-500/80">target-in</code> for suggestions.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Main Properties Panel
// ============================================================================

export function PropertiesPanel({ 
  selectedNode, 
  nodes, 
  timerLog, 
  globalSettings, 
  onSettingsChange,
  onNodeDataChange,
  onNodeDelete,
  activeTab = 'properties',
  availableVariables = {},
  edges = [],
  nodeInstances,
  connectionContext,
  nodeMap,
}: PropertiesPanelProps) {
  const [localActiveTab, setLocalActiveTab] = useState(activeTab);

  useEffect(() => {
    setLocalActiveTab(activeTab);
  }, [activeTab]);

  const totalTime = nodes.reduce((acc, node) => {
    // Basic nodes use OpforNodeData, range nodes use RangeTargetData
    const duration = (node.data as OpforNodeData)?.definition?.estimatedDuration || 0;
    return acc + duration;
  }, 0);

  // Compute resolved variables for selected node
  const resolvedVariables = useMemo((): Map<string, ResolvedVariable> => {
    const resolved = new Map<string, ResolvedVariable>();
    
    if (!selectedNode || !connectionContext || !nodeInstances || !nodeMap) {
      return resolved;
    }

    const nodeData = selectedNode.data as OpforNodeData;
    if (!nodeData.parameters) return resolved;

    Object.entries(nodeData.parameters).forEach(([paramId, value]) => {
      const strValue = String(value ?? '');
      
      if (strValue.startsWith('${') && strValue.endsWith('}')) {
        const resolution = resolveVariableReference(
          strValue,
          selectedNode.id,
          connectionContext,
          nodeInstances,
          nodeMap
        );
        if (resolution) {
          resolved.set(paramId, resolution);
        }
      }
    });

    return resolved;
  }, [selectedNode, connectionContext, nodeInstances, nodeMap]);

  const handleParameterChange = (paramId: string, value: string | number) => {
    if (!selectedNode || !onNodeDataChange) return;
    
    const nodeData = selectedNode.data as OpforNodeData;
    const updatedData = {
      ...nodeData,
      parameters: {
        ...nodeData.parameters,
        [paramId]: value,
      },
    };
    
    onNodeDataChange(selectedNode.id, updatedData);
  };

  // Count linked variables for current node
  const linkedVariableCount = useMemo(() => {
    if (!selectedNode || selectedNode.type === 'rangeTargetNode') return 0;
    const nodeData = selectedNode.data as OpforNodeData;
    return Object.values(nodeData.parameters || {})
      .filter(v => typeof v === 'string' && v.startsWith('${'))
      .length;
  }, [selectedNode]);

  // Count resolved (connected) variables
  const resolvedVariableCount = useMemo(() => {
    return Array.from(resolvedVariables.values()).filter(r => r.wasResolved).length;
  }, [resolvedVariables]);

  // Route Range Target Node selection
  if (selectedNode?.type === 'rangeTargetNode') {
    return (
      <RangeTargetInspector
        data={selectedNode.data as RangeTargetData}
        onDataChange={(patch) => onNodeDataChange?.(selectedNode.id, patch)}
        onDelete={() => onNodeDelete?.(selectedNode.id)}
      />
    );
  }

  const renderContent = () => {
    switch (localActiveTab) {
      case 'properties':
        return (
          <ScrollArea className="h-full custom-scrollbar">
            {selectedNode ? (
              <div className="p-4 space-y-4">
                {/* Node Header */}
                {(() => {
                   const nodeData = selectedNode.data as OpforNodeData;
                   return (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{nodeData.definition.icon}</span>
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {nodeData.label || nodeData.definition.name}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {nodeData.definition.category} › {nodeData.definition.subcategory}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {nodeData.definition.description}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <Badge 
                            variant="outline" 
                            className={cn(
                              'text-[10px]',
                              tacticBadgeStyles[nodeData.definition.tactic]
                            )}
                          >
                            {tacticLabels[nodeData.definition.tactic]}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              'text-[10px]',
                              nodeData.definition.riskLevel === 'low' && 'bg-green-500/20 text-green-400 border-green-500/30',
                              nodeData.definition.riskLevel === 'medium' && 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                              nodeData.definition.riskLevel === 'high' && 'bg-orange-500/20 text-orange-400 border-orange-500/30',
                              nodeData.definition.riskLevel === 'critical' && 'bg-red-500/20 text-red-400 border-red-500/30',
                            )}
                          >
                            Risk: {nodeData.definition.riskLevel}
                          </Badge>
                          {resolvedVariableCount > 0 && (
                            <Badge 
                              variant="outline" 
                              className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            >
                              <Link2 className="h-3 w-3 mr-1" />
                              {resolvedVariableCount} linked
                            </Badge>
                          )}
                          {linkedVariableCount > resolvedVariableCount && (
                            <Badge 
                              variant="outline" 
                              className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30"
                            >
                              <Unlink className="h-3 w-3 mr-1" />
                              {linkedVariableCount - resolvedVariableCount} unlinked
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Separator />

                      {/* Parameters Section */}
                      {nodeData.definition.parameters && nodeData.definition.parameters.length > 0 && (
                        <>
                          <div className="space-y-3">
                            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                              <Terminal className="h-4 w-4" />
                              Parameters
                              {Object.keys(availableVariables).length > 0 && (
                                <span className="text-[10px] text-cyan-400 ml-auto flex items-center gap-1">
                                  <Link2 className="h-3 w-3" />
                                  {Object.keys(availableVariables).length} vars available
                                </span>
                              )}
                            </h4>
                            {nodeData.definition.parameters.map(param => {
                              const value = nodeData.parameters[param.id];
                              const isMissing = param.required && (
                                value === undefined || 
                                value === null || 
                                value === '' || 
                                (typeof value === 'string' && value.trim() === '')
                              );
                              const strValue = String(value ?? '');
                              const isVariableRef = strValue.startsWith('${') && strValue.endsWith('}');
                              const resolvedVar = resolvedVariables.get(param.id);
                              const isResolved = resolvedVar?.wasResolved === true;
                              
                              return (
                                <div key={param.id} className="space-y-1.5">
                                  <Label className={cn(
                                    "text-[11px] flex items-center gap-1",
                                    isMissing ? "text-yellow-400" : "text-muted-foreground",
                                    isResolved && "text-emerald-400",
                                    isVariableRef && !isResolved && "text-cyan-400"
                                  )}>
                                    {isResolved && <Link2 className="h-3 w-3" />}
                                    {isVariableRef && !isResolved && <Unlink className="h-3 w-3" />}
                                    {param.label}
                                    {param.required && !isResolved && <span className="text-destructive">*</span>}
                                    {param.dynamicOptions && !isResolved && (
                                      <span className="ml-auto text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded">
                                        Dynamic
                                      </span>
                                    )}
                                    {isResolved && (
                                      <span className="ml-auto text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                                        ↳ Inherited
                                      </span>
                                    )}
                                    {isMissing && !param.dynamicOptions && !isResolved && (
                                      <span className="ml-auto text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                                        Required
                                      </span>
                                    )}
                                  </Label>
                                  <ParameterInput
                                    param={param}
                                    value={value}
                                    onChange={(value) => handleParameterChange(param.id, value)}
                                    availableVariables={availableVariables}
                                    currentNodeId={selectedNode.id}
                                    resolvedVariable={resolvedVar}
                                    isInherited={isResolved && isVariableRef}
                                    allNodes={nodes}
                                    connectionContext={connectionContext}
                                  />
                                  {param.description && (
                                    <p className="text-[10px] text-muted-foreground italic">
                                      {param.description}
                                    </p>
                                  )}
                                  {isMissing && !param.dynamicOptions && (
                                    <p className="text-[10px] text-yellow-400 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      This parameter must be filled before validation
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <Separator />
                        </>
                      )}

                      {/* Inputs */}
                      {nodeData.definition.inputs.length > 0 && (
                        <>
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-foreground">Inputs</h4>
                            {nodeData.definition.inputs.map(input => {
                              const isConnected = edges.some(
                                e => e.target === selectedNode.id && (e.targetHandle === input.id || (!e.targetHandle && input.id === 'default'))
                              );
                              
                              return (
                                <div 
                                  key={input.id} 
                                  className={cn(
                                    "p-2 rounded-md border",
                                    isConnected 
                                      ? "bg-emerald-500/10 border-emerald-500/30" 
                                      : "bg-sidebar-accent border-sidebar-border"
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className={cn(
                                      "text-xs",
                                      isConnected ? "text-emerald-400" : "text-foreground"
                                    )}>
                                      {isConnected && <Link2 className="h-3 w-3 inline mr-1.5" />}
                                      {input.label}
                                    </span>
                                    {input.required && !isConnected && (
                                      <span className="text-[10px] text-destructive">Required</span>
                                    )}
                                    {isConnected && (
                                      <span className="text-[10px] text-emerald-400">Connected</span>
                                    )}
                                  </div>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                                    {input.type}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <Separator />
                        </>
                      )}

                      {/* Outputs */}
                      {nodeData.definition.outputs.length > 0 && (
                        <>
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-foreground">Outputs</h4>
                            {nodeData.definition.outputs.map(output => {
                              const isConnected = edges.some(
                                e => e.source === selectedNode.id && (e.sourceHandle === output.id || (!e.sourceHandle && output.id === 'default'))
                              );
                              
                              return (
                                <div 
                                  key={output.id} 
                                  className={cn(
                                    "p-2 rounded-md border",
                                    isConnected 
                                      ? "bg-cyan-500/10 border-cyan-500/30" 
                                      : "bg-sidebar-accent border-sidebar-border"
                                  )}
                                >
                                  <span className={cn(
                                    "text-xs",
                                    isConnected ? "text-cyan-400" : "text-foreground"
                                  )}>
                                    {isConnected && <ArrowRight className="h-3 w-3 inline mr-1.5" />}
                                    {output.label}
                                  </span>
                                  <br />
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono">
                                    {output.type}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <Separator />
                        </>
                      )}

                      {/* Meta Info */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Estimated Time</span>
                          <span className="text-foreground font-medium">
                            {nodeData.definition.estimatedDuration < 60 
                              ? `${nodeData.definition.estimatedDuration}s` 
                              : `${Math.round(nodeData.definition.estimatedDuration / 60)}m`}
                          </span>
                        </div>
                      </div>

                      <div className={cn(
                        "flex items-center gap-2 p-2 rounded-md",
                        resolvedVariableCount > 0 
                          ? "bg-emerald-500/10 border border-emerald-500/20"
                          : "bg-green-500/10 border border-green-500/20"
                      )}>
                        <CheckCircle2 className={cn(
                          "h-4 w-4",
                          resolvedVariableCount > 0 ? "text-emerald-500" : "text-green-500"
                        )} />
                        <span className={cn(
                          "text-xs",
                          resolvedVariableCount > 0 ? "text-emerald-400" : "text-green-400"
                        )}>
                          {resolvedVariableCount > 0 
                            ? `Ready — ${resolvedVariableCount} variable(s) resolved from connections`
                            : 'Ready to execute'
                          }
                        </span>
                      </div>
                    </>
                   );
                })()}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-4">
                <div className="text-center space-y-2">
                  <Info className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Select a TTP to configure
                  </p>
                </div>
              </div>
            )}
          </ScrollArea>
        );

      case 'instructions':
        return (
          <ScrollArea className="h-full custom-scrollbar">
            <div className="p-4 space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">
                  {globalSettings.executionPlanName || 'Untitled Operation'}
                </h3>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Steps: {nodes.length}</span>
                  <span>•</span>
                  <span>Total: ~{Math.round(totalTime / 60)} min</span>
                </div>
              </div>
              <Separator />
              {nodes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Add TTPs to build operation sequence
                </p>
              ) : (
                <div className="space-y-3">
                  {nodes.map((node, index) => {
                    const nodeData = node.data as OpforNodeData;
                    const isTarget = node.type === 'rangeTargetNode';
                    return (
                      <div 
                        key={node.id} 
                        className={cn(
                          "p-3 rounded-md border",
                          isTarget ? "bg-emerald-500/5 border-emerald-500/20" : "bg-sidebar-accent border-sidebar-border"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className={cn(
                            "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0",
                            isTarget ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"
                          )}>
                            {index + 1}
                          </span>
                          <div className="flex-1 space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span>{isTarget ? (node.data as RangeTargetData).icon || '🎯' : nodeData.definition.icon}</span>
                              <h4 className="text-sm font-semibold text-foreground">
                                {isTarget ? (node.data as RangeTargetData).name : nodeData.definition.name}
                              </h4>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {isTarget ? `Target: ${(node.data as RangeTargetData).fields.ip || 'Unset'}` : nodeData.definition.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        );

      case 'log':
        return (
          <ScrollArea className="h-full custom-scrollbar">
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Execution Timeline
              </h3>
              {timerLog.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No events yet</p>
              ) : (
                <div className="space-y-2">
                  {timerLog.map(entry => (
                    <div 
                      key={entry.id} 
                      className="p-2 rounded-md bg-sidebar-accent border border-sidebar-border"
                    >
                      <div className="flex items-start gap-2">
                        {entry.type === 'validation' && <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />}
                        {entry.type === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />}
                        {entry.type === 'error' && <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />}
                        {entry.type === 'update' && <Info className="h-4 w-4 text-blue-500 mt-0.5" />}
                        {entry.type === 'export' && <FileText className="h-4 w-4 text-purple-500 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground">{entry.message}</p>
                          {entry.details && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {entry.details}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {entry.timestamp.toLocaleTimeString()}
                            {entry.operator && ` • ${entry.operator}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        );

      case 'settings':
        return (
          <ScrollArea className="h-full custom-scrollbar">
            <div className="p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Campaign Configuration
              </h3>

              {/* Identity */}
              <div className="space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Identity</div>
                <div className="space-y-2">
                  <Label htmlFor="planName" className="text-xs">Campaign Name</Label>
                  <Input
                    id="planName"
                    value={globalSettings.executionPlanName}
                    onChange={e => onSettingsChange({ ...globalSettings, executionPlanName: e.target.value })}
                    className="bg-sidebar-accent border-sidebar-border h-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operator" className="text-xs">Lead Operator</Label>
                  <Input
                    id="operator"
                    value={globalSettings.operator}
                    onChange={e => onSettingsChange({ ...globalSettings, operator: e.target.value })}
                    className="bg-sidebar-accent border-sidebar-border h-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redTeam" className="text-xs">Red Team</Label>
                  <Input
                    id="redTeam"
                    value={globalSettings.redTeam}
                    onChange={e => onSettingsChange({ ...globalSettings, redTeam: e.target.value })}
                    className="bg-sidebar-accent border-sidebar-border h-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetNetwork" className="text-xs">Target Network</Label>
                  <Input
                    id="targetNetwork"
                    placeholder="10.0.0.0/24"
                    value={globalSettings.targetNetwork}
                    onChange={e => onSettingsChange({ ...globalSettings, targetNetwork: e.target.value })}
                    className="bg-sidebar-accent border-sidebar-border h-8 text-xs"
                  />
                </div>
              </div>

              <Separator />

              {/* C2 Teamserver */}
              <div className="space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">C2 Teamserver</div>
                <div className="space-y-2">
                  <Label htmlFor="c2Server" className="text-xs">Teamserver IP</Label>
                  <Input
                    id="c2Server"
                    placeholder="202.84.73.4"
                    value={globalSettings.c2Server}
                    onChange={e => onSettingsChange({ ...globalSettings, c2Server: e.target.value })}
                    className="bg-sidebar-accent border-sidebar-border h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="csUser" className="text-xs">Username</Label>
                  <Input
                    id="csUser"
                    placeholder="bah"
                    value={globalSettings.csUser || ''}
                    onChange={e => onSettingsChange({ ...globalSettings, csUser: e.target.value })}
                    className="bg-sidebar-accent border-sidebar-border h-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="csPass" className="text-xs">Password</Label>
                  <Input
                    id="csPass"
                    type="password"
                    placeholder="••••••••"
                    value={globalSettings.csPass || ''}
                    onChange={e => onSettingsChange({ ...globalSettings, csPass: e.target.value })}
                    className="bg-sidebar-accent border-sidebar-border h-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="csPort" className="text-xs">Port</Label>
                  <Input
                    id="csPort"
                    placeholder="50050"
                    value={globalSettings.csPort || ''}
                    onChange={e => onSettingsChange({ ...globalSettings, csPort: e.target.value })}
                    className="bg-sidebar-accent border-sidebar-border h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="csDir" className="text-xs">CS Directory</Label>
                  <Input
                    id="csDir"
                    placeholder="/opt/cobaltstrike"
                    value={globalSettings.csDir || ''}
                    onChange={e => onSettingsChange({ ...globalSettings, csDir: e.target.value })}
                    className="bg-sidebar-accent border-sidebar-border h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <Separator />

              {/* Operator Environment */}
              <div className="space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Operator Environment</div>
                <div className="space-y-2">
                  <Label htmlFor="workdir" className="text-xs">Work Directory</Label>
                  <Input
                    id="workdir"
                    placeholder="%{HOME}/sandworm/"
                    value={globalSettings.workdir || ''}
                    onChange={e => onSettingsChange({ ...globalSettings, workdir: e.target.value })}
                    className="bg-sidebar-accent border-sidebar-border h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-zinc-600 italic">Use %{'{HOME}'} — Robot Framework env var syntax</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sudoNeeded" className="text-xs">Sudo Required</Label>
                  <Select
                    value={globalSettings.sudoNeeded || '${False}'}
                    onValueChange={v => onSettingsChange({ ...globalSettings, sudoNeeded: v })}
                  >
                    <SelectTrigger className="bg-sidebar-accent border-sidebar-border h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="${False}" className="text-xs">{"${False}"}</SelectItem>
                      <SelectItem value="${True}" className="text-xs">{"${True}"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debugMode" className="text-xs">Debug Mode</Label>
                  <Select
                    value={globalSettings.debugMode || '${False}'}
                    onValueChange={v => onSettingsChange({ ...globalSettings, debugMode: v })}
                  >
                    <SelectTrigger className="bg-sidebar-accent border-sidebar-border h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="${False}" className="text-xs">{"${False}"}</SelectItem>
                      <SelectItem value="${True}" className="text-xs">{"${True}"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Auto-generated — read-only info panel */}
              <div className="p-3 rounded-md bg-zinc-900/50 border border-zinc-800 space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Auto-generated</div>
                <div className="space-y-1.5 text-[10px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">ARTIFACT_DIR</span>
                    <span className="text-zinc-400">
                      {'artifact/'}
                      {(globalSettings.executionPlanName || 'campaign')
                        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">LOCAL_INITIAL_BEACON</span>
                    <span className="text-zinc-400">{'${WORKDIR}'}update.exe</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">TARGET1, TARGET2…</span>
                    <span className="text-zinc-600 italic">from node params</span>
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full border-sidebar-border text-xs"
                onClick={() => {
                  onSettingsChange({
                    executionPlanName: 'Hunt 1',
                    targetNetwork: '',
                    c2Server: '202.84.73.4',
                    sessionId: 'session_01',
                    operator: '',
                    redTeam: '',
                    notes: '',
                    csUser: 'bah',
                    csPass: '',
                    csDir: '/opt/cobaltstrike',
                    csPort: '50050',
                    workdir: '%{HOME}/sandworm/',
                    debugMode: '${False}',
                    sudoNeeded: '${False}',
                  });
                }}
              >
                Reset to Defaults
              </Button>
            </div>
          </ScrollArea>
        );

      default:
        return null;
    }
  };

  return <div className="h-full">{renderContent()}</div>;
}