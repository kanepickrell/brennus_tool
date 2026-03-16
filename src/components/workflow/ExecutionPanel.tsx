// src/components/workflow/ExecutionPanel.tsx
// Bottom panel for execution output - IDE-style resizable terminal

import { useState, useRef, useCallback } from 'react';
import { 
  Terminal, 
  ChevronDown, 
  ChevronUp,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TerminalView } from './TerminalView';

// ============================================================================
// Types
// ============================================================================

export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export interface ExecutionLogLine {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning' | 'command' | 'output' | 'step';
  message: string;
  nodeId?: string;
  nodeName?: string;
  details?: string;
}

export interface ExecutionState {
  status: ExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  currentNodeId?: string;
  currentNodeName?: string;
  progress: number; // 0-100
  totalSteps: number;
  completedSteps: number;
  logs: ExecutionLogLine[];
  error?: string;
}

interface ExecutionPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  executionState: ExecutionState;
  onRun: () => void;
  onStop: () => void;
  onRerun: () => void;
  /** Highlight a node on the canvas */
  onHighlightNode?: (nodeId: string | null) => void;
  /** Robot script content for real execution */
  scriptContent?: string;
  /** API base URL for terminal WebSocket */
  apiBaseUrl?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function ExecutionPanel({
  isOpen,
  onToggle,
  onClose,
  executionState,
  onRun,
  onStop,
  onRerun,
  onHighlightNode,
  scriptContent,
  apiBaseUrl = 'http://localhost:8001',
}: ExecutionPanelProps) {
  const [height, setHeight] = useState(300);
  const [isMaximized, setIsMaximized] = useState(false);
  const [executionKey, setExecutionKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  
  // Increment key when panel opens to force terminal remount
  const prevIsOpen = useRef(isOpen);
  if (isOpen && !prevIsOpen.current) {
    // Panel just opened - will trigger on next render
    setTimeout(() => setExecutionKey(k => k + 1), 0);
  }
  prevIsOpen.current = isOpen;

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const startY = e.clientY;
    const startHeight = height;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY - e.clientY;
      const newHeight = Math.min(Math.max(startHeight + delta, 150), window.innerHeight - 200);
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height]);

  // Collapsed bar (always visible)
  if (!isOpen) {
    return (
      <div 
        className="h-8 bg-zinc-950 border-t border-zinc-800 flex items-center px-4 cursor-pointer hover:bg-zinc-900 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 flex-1">
          <Terminal className="h-4 w-4 text-zinc-500" />
          <span className="text-xs font-mono text-zinc-400">TERMINAL</span>
        </div>
        <ChevronUp className="h-4 w-4 text-zinc-500" />
      </div>
    );
  }

  const panelHeight = isMaximized ? 'calc(100vh - 120px)' : `${height}px`;

  return (
    <div 
      ref={panelRef}
      className="bg-zinc-950 border-t border-zinc-800 flex flex-col"
      style={{ height: panelHeight }}
    >
      {/* Resize Handle */}
      <div 
        className="h-1 bg-zinc-900 hover:bg-blue-500/50 cursor-ns-resize transition-colors flex-shrink-0"
        onMouseDown={handleMouseDown}
      />

      {/* Header */}
      <div className="h-10 bg-zinc-900/50 border-b border-zinc-800 flex items-center px-3 gap-2 flex-shrink-0">
        {/* Title */}
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
            Terminal
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Window Controls */}
        <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Collapse"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <TerminalView
          key={executionKey}
          scriptContent={scriptContent}
          apiBaseUrl={apiBaseUrl}
          height="100%"
          autoStart={true}
          onComplete={(code) => {
            // Could update execution state here
          }}
          onError={(error) => {
            console.error('Terminal error:', error);
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Hook for managing execution state
// ============================================================================

export function useExecutionState() {
  const [state, setState] = useState<ExecutionState>({
    status: 'idle',
    progress: 0,
    totalSteps: 0,
    completedSteps: 0,
    logs: [],
  });

  const addLog = useCallback((log: Omit<ExecutionLogLine, 'id' | 'timestamp'>) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, {
        ...log,
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: new Date(),
      }],
    }));
  }, []);

  const startExecution = useCallback((totalSteps: number) => {
    setState({
      status: 'running',
      startedAt: new Date(),
      completedAt: undefined,
      currentNodeId: undefined,
      currentNodeName: undefined,
      progress: 0,
      totalSteps,
      completedSteps: 0,
      logs: [{
        id: `log-${Date.now()}`,
        timestamp: new Date(),
        type: 'info',
        message: 'Starting workflow execution...',
      }],
    });
  }, []);

  const setCurrentNode = useCallback((nodeId: string, nodeName: string) => {
    setState(prev => ({
      ...prev,
      currentNodeId: nodeId,
      currentNodeName: nodeName,
    }));
  }, []);

  const completeStep = useCallback((nodeId: string, nodeName: string, success: boolean, message?: string) => {
    setState(prev => {
      const completedSteps = prev.completedSteps + 1;
      const progress = Math.round((completedSteps / prev.totalSteps) * 100);
      
      return {
        ...prev,
        completedSteps,
        progress,
        logs: [...prev.logs, {
          id: `log-${Date.now()}`,
          timestamp: new Date(),
          type: success ? 'success' : 'error',
          message: message || (success ? 'Completed' : 'Failed'),
          nodeId,
          nodeName,
        }],
      };
    });
  }, []);

  const completeExecution = useCallback((success: boolean, error?: string) => {
    setState(prev => ({
      ...prev,
      status: success ? 'completed' : 'failed',
      completedAt: new Date(),
      progress: 100,
      error,
      logs: [...prev.logs, {
        id: `log-${Date.now()}`,
        timestamp: new Date(),
        type: success ? 'success' : 'error',
        message: success ? 'Workflow execution completed successfully' : `Workflow execution failed: ${error}`,
      }],
    }));
  }, []);

  const stopExecution = useCallback(() => {
    setState(prev => ({
      ...prev,
      status: 'stopped',
      completedAt: new Date(),
      logs: [...prev.logs, {
        id: `log-${Date.now()}`,
        timestamp: new Date(),
        type: 'warning',
        message: 'Execution stopped by user',
      }],
    }));
  }, []);

  const resetExecution = useCallback(() => {
    setState({
      status: 'idle',
      progress: 0,
      totalSteps: 0,
      completedSteps: 0,
      logs: [],
    });
  }, []);

  return {
    state,
    addLog,
    startExecution,
    setCurrentNode,
    completeStep,
    completeExecution,
    stopExecution,
    resetExecution,
  };
}