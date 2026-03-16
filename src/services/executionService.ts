// src/services/executionService.ts
// Service for executing Robot Framework scripts and managing infrastructure

import { Node, Edge } from '@xyflow/react';
import { OpforNodeData } from '@/types/opfor';
import { generateRobotScript } from './robotScriptGenerator';
import { ExecutionLogLine } from '@/components/workflow/ExecutionPanel';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionConfig {
  apiBaseUrl: string;
  globalSettings: {
    csIp: string;
    csPort: number;
    csUser: string;
    csPassword: string;
    csDir: string;
  };
}

export interface InfrastructureStatus {
  c2Connected: boolean;
  c2Host?: string;
  c2Port?: number;
  robotAvailable: boolean;
  robotVersion?: string;
  listeners: string[];
  payloads: string[];
}

type LogCallback = (log: Omit<ExecutionLogLine, 'id' | 'timestamp'>) => void;
type NodeCallback = (nodeId: string, nodeName: string) => void;
type StepCallback = (nodeId: string, nodeName: string, success: boolean, message?: string) => void;

// ============================================================================
// API Client
// ============================================================================

const API_BASE = 'http://localhost:8000';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || 'API request failed');
  }
  
  return response.json();
}

// ============================================================================
// Infrastructure Status
// ============================================================================

export async function checkInfrastructureStatus(): Promise<InfrastructureStatus> {
  try {
    const status = await fetchApi<{
      robot_framework: { available: boolean; status: string };
      cobalt_strike: { available: boolean; connected: boolean; teamserver?: string; listeners?: number; payloads?: number };
    }>('/api/infrastructure/status');
    
    // Get detailed C2 status
    let c2Status = { connected: false, host: undefined as string | undefined, port: undefined as number | undefined };
    if (status.cobalt_strike.connected) {
      const c2Info = await fetchApi<{ connected: boolean; info?: { host: string; port: number } }>('/api/c2/status');
      c2Status = {
        connected: c2Info.connected,
        host: c2Info.info?.host,
        port: c2Info.info?.port,
      };
    }
    
    // Get listeners and payloads
    let listeners: string[] = [];
    let payloads: string[] = [];
    
    if (status.cobalt_strike.connected) {
      try {
        const listenersData = await fetchApi<{ listeners: Array<{ name: string }> }>('/api/c2/listeners');
        listeners = listenersData.listeners.map(l => l.name);
        
        const payloadsData = await fetchApi<{ payloads: Array<{ name: string }> }>('/api/c2/payloads');
        payloads = payloadsData.payloads.map(p => p.name);
      } catch {
        // Ignore errors fetching details
      }
    }
    
    return {
      c2Connected: status.cobalt_strike.connected,
      c2Host: c2Status.host,
      c2Port: c2Status.port,
      robotAvailable: status.robot_framework.available,
      robotVersion: status.robot_framework.status,
      listeners,
      payloads,
    };
  } catch (error) {
    console.error('Failed to check infrastructure status:', error);
    return {
      c2Connected: false,
      robotAvailable: false,
      listeners: [],
      payloads: [],
    };
  }
}

// ============================================================================
// Execution Runner
// ============================================================================

export interface ExecutionCallbacks {
  onLog: LogCallback;
  onNodeStart: NodeCallback;
  onNodeComplete: StepCallback;
  onInfrastructureUpdate: (status: InfrastructureStatus) => void;
}

export async function executeWorkflow(
  nodes: Node<OpforNodeData>[],
  edges: Edge[],
  config: ExecutionConfig,
  callbacks: ExecutionCallbacks,
  abortSignal?: AbortSignal
): Promise<boolean> {
  const { onLog, onNodeStart, onNodeComplete, onInfrastructureUpdate } = callbacks;
  
  try {
    // Step 1: Check infrastructure
    onLog({ type: 'info', message: 'Checking infrastructure status...' });
    const infraStatus = await checkInfrastructureStatus();
    onInfrastructureUpdate(infraStatus);
    
    if (!infraStatus.robotAvailable) {
      onLog({ type: 'error', message: 'Robot Framework is not available. Please install it.' });
      return false;
    }
    
    onLog({ type: 'success', message: `Robot Framework: ${infraStatus.robotVersion}` });
    
    // Step 2: Generate Robot script
    onLog({ type: 'info', message: 'Generating Robot Framework script...' });
    
    const script = generateRobotScript(nodes, edges, {
      csIp: config.globalSettings.csIp,
      csPort: config.globalSettings.csPort,
      csUser: config.globalSettings.csUser,
      csPassword: config.globalSettings.csPassword,
      csDir: config.globalSettings.csDir,
    });
    
    onLog({ type: 'command', message: 'robot --outputdir /tmp/operator workflow.robot' });
    onLog({ type: 'output', message: script.split('\n').slice(0, 5).join('\n') + '\n...' });
    
    // Step 3: Execute via API
    onLog({ type: 'info', message: 'Starting Robot Framework execution...' });
    
    const execution = await fetchApi<{ execution_id: string; status: string }>('/api/robot/execute', {
      method: 'POST',
      body: JSON.stringify({
        script_content: script,
        script_name: 'workflow.robot',
        variables: {
          CS_IP: config.globalSettings.csIp,
          CS_PORT: String(config.globalSettings.csPort),
          CS_USER: config.globalSettings.csUser,
          CS_PASSWORD: config.globalSettings.csPassword,
        },
      }),
    });
    
    onLog({ type: 'info', message: `Execution started: ${execution.execution_id}` });
    
    // Step 4: Stream output
    const eventSource = new EventSource(`${API_BASE}/api/robot/execution/${execution.execution_id}/stream`);
    
    return new Promise((resolve, reject) => {
      // Handle abort
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          eventSource.close();
          onLog({ type: 'warning', message: 'Execution aborted by user' });
          resolve(false);
        });
      }
      
      // Track which node we're on
      let currentNodeIndex = 0;
      const connectedNodes = getConnectedNodes(nodes, edges);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'output') {
            const line = data.line as string;
            
            // Parse Robot Framework output to track progress
            if (line.includes('| PASS')) {
              const nodeName = extractNodeName(line);
              const node = connectedNodes.find(n => n.data.definition.name === nodeName);
              if (node) {
                onNodeComplete(node.id, nodeName, true, 'PASS');
                currentNodeIndex++;
                
                // Check next node
                if (currentNodeIndex < connectedNodes.length) {
                  const nextNode = connectedNodes[currentNodeIndex];
                  onNodeStart(nextNode.id, nextNode.data.definition.name);
                }
              }
            } else if (line.includes('| FAIL')) {
              const nodeName = extractNodeName(line);
              const node = connectedNodes.find(n => n.data.definition.name === nodeName);
              if (node) {
                onNodeComplete(node.id, nodeName, false, 'FAIL');
              }
            } else if (line.includes('| RUNNING')) {
              const nodeName = extractNodeName(line);
              const node = connectedNodes.find(n => n.data.definition.name === nodeName);
              if (node) {
                onNodeStart(node.id, nodeName);
              }
            }
            
            // Log the raw output
            onLog({ type: 'output', message: line });
          } else if (data.type === 'complete') {
            eventSource.close();
            
            // Update infrastructure status
            checkInfrastructureStatus().then(onInfrastructureUpdate);
            
            if (data.status === 'completed') {
              onLog({ type: 'success', message: 'Workflow execution completed' });
              resolve(true);
            } else {
              onLog({ type: 'error', message: `Workflow execution failed (exit code: ${data.return_code})` });
              resolve(false);
            }
          }
        } catch (e) {
          console.error('Error parsing event:', e);
        }
      };
      
      eventSource.onerror = (error) => {
        eventSource.close();
        onLog({ type: 'error', message: 'Connection to execution server lost' });
        reject(error);
      };
      
      // Start tracking first node
      if (connectedNodes.length > 0) {
        onNodeStart(connectedNodes[0].id, connectedNodes[0].data.definition.name);
      }
    });
    
  } catch (error) {
    onLog({ type: 'error', message: `Execution failed: ${error}` });
    return false;
  }
}

// ============================================================================
// Simulation Runner (Mock execution without API)
// ============================================================================

export async function simulateWorkflow(
  nodes: Node<OpforNodeData>[],
  edges: Edge[],
  config: ExecutionConfig,
  callbacks: ExecutionCallbacks,
  abortSignal?: AbortSignal
): Promise<boolean> {
  const { onLog, onNodeStart, onNodeComplete, onInfrastructureUpdate } = callbacks;
  
  const connectedNodes = getConnectedNodes(nodes, edges);
  
  if (connectedNodes.length === 0) {
    onLog({ type: 'error', message: 'No connected nodes to execute' });
    return false;
  }
  
  onLog({ type: 'info', message: `Starting simulation with ${connectedNodes.length} nodes...` });
  
  // Track infrastructure state
  let infraState: InfrastructureStatus = {
    c2Connected: false,
    robotAvailable: true,
    robotVersion: 'Robot Framework 6.1 (Simulated)',
    listeners: [],
    payloads: [],
  };
  onInfrastructureUpdate(infraState);
  
  // Execute each node with simulated delays
  for (let i = 0; i < connectedNodes.length; i++) {
    if (abortSignal?.aborted) {
      onLog({ type: 'warning', message: 'Simulation aborted by user' });
      return false;
    }
    
    const node = connectedNodes[i];
    const nodeName = node.data.definition.name;
    const nodeId = node.id;
    
    onNodeStart(nodeId, nodeName);
    onLog({ type: 'step', message: `Executing ${nodeName}...`, nodeId, nodeName });
    
    // Simulate execution time based on estimated duration
    const duration = typeof node.data.definition.estimatedDuration === 'number' 
      ? node.data.definition.estimatedDuration 
      : 2;
    
    // Use shorter delays for simulation
    const simulatedDelay = Math.min(duration * 200, 2000);
    await sleep(simulatedDelay);
    
    // Simulate specific node behaviors
    if (nodeName.toLowerCase().includes('start c2')) {
      infraState = {
        ...infraState,
        c2Connected: true,
        c2Host: config.globalSettings.csIp,
        c2Port: config.globalSettings.csPort,
      };
      onInfrastructureUpdate(infraState);
      onLog({ type: 'output', message: `  → Connected to ${config.globalSettings.csIp}:${config.globalSettings.csPort}` });
    } else if (nodeName.toLowerCase().includes('listener')) {
      const listenerName = node.data.parameters.listenerName || 'http-listener';
      infraState = {
        ...infraState,
        listeners: [...infraState.listeners, String(listenerName)],
      };
      onInfrastructureUpdate(infraState);
      onLog({ type: 'output', message: `  → Created listener: ${listenerName}` });
    } else if (nodeName.toLowerCase().includes('payload')) {
      const payloadName = node.data.parameters.payloadName || 'beacon.exe';
      infraState = {
        ...infraState,
        payloads: [...infraState.payloads, String(payloadName)],
      };
      onInfrastructureUpdate(infraState);
      onLog({ type: 'output', message: `  → Generated payload: ${payloadName}` });
    }
    
    // Mark complete
    onNodeComplete(nodeId, nodeName, true, 'Completed');
    onLog({ type: 'success', message: `${nodeName}: PASS`, nodeId, nodeName });
  }
  
  onLog({ type: 'success', message: `Simulation completed: ${connectedNodes.length} nodes executed` });
  return true;
}

// ============================================================================
// Helpers
// ============================================================================

function getConnectedNodes(nodes: Node<OpforNodeData>[], edges: Edge[]): Node<OpforNodeData>[] {
  // Build adjacency map
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  
  edges.forEach(edge => {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge.target);
    
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge.source);
  });
  
  // Find connected node IDs
  const connectedIds = new Set<string>();
  edges.forEach(edge => {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  });
  
  // Filter and sort topologically
  const connectedNodes = nodes.filter(n => connectedIds.has(n.id));
  
  // Simple topological sort
  const sorted: Node<OpforNodeData>[] = [];
  const visited = new Set<string>();
  
  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    
    const deps = incoming.get(nodeId) || [];
    deps.forEach(dep => visit(dep));
    
    const node = connectedNodes.find(n => n.id === nodeId);
    if (node) sorted.push(node);
  }
  
  connectedNodes.forEach(node => visit(node.id));
  
  return sorted;
}

function extractNodeName(line: string): string {
  // Extract node name from Robot Framework output like "Create Listener | PASS |"
  const match = line.match(/^([^|]+)\s*\|/);
  return match ? match[1].trim() : '';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}