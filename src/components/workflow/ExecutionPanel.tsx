// src/components/workflow/ExecutionPanel.tsx
// Bottom IDE panel — Terminal tab runs real Robot Framework via WebSocket,
// Script tab shows the generated .robot source.
// Execute button in WorkflowBuilder calls terminalRef.current?.startExecution(script).

import {
  useState, useRef, useCallback, useEffect,
  useImperativeHandle, forwardRef,
} from 'react';
import {
  Play, Square, RotateCcw, ChevronDown, ChevronUp,
  Terminal, FileText, Maximize2, Minimize2, X,
  CheckCircle2, XCircle, Loader2, Clock, Copy, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TerminalView, type TerminalHandle } from './TerminalView';
import type { ExecutionState } from '@/services/executionService';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ExecutionPanelHandle {
  /** Trigger execution with a script string — called from WorkflowBuilder */
  execute: (script: string) => void;
  stop: () => void;
}

interface ExecutionPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  executionState: ExecutionState;
  onRun: () => void;
  onStop: () => void;
  onRerun: () => void;
  onHighlightNode?: (nodeId: string | null) => void;
  /** Generated .robot script — passed in from WorkflowBuilder */
  scriptContent?: string;
  apiBaseUrl?: string;
}

type Tab = 'terminal' | 'script';

const MIN_HEIGHT = 180;
const DEFAULT_HEIGHT = 320;

// ─────────────────────────────────────────────────────────────
// Script viewer with syntax highlighting
// ─────────────────────────────────────────────────────────────

function ScriptViewer({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.robot';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Minimal syntax coloring via spans — no external lib needed
  const colorize = (line: string, idx: number) => {
    let cls = 'text-zinc-400';
    if (line.startsWith('***')) cls = 'text-amber-400 font-semibold';
    else if (line.trim().startsWith('#')) cls = 'text-zinc-600 italic';
    else if (line.trim().startsWith('${') || line.trim().startsWith('@{')) cls = 'text-sky-400';
    else if (/^[A-Z][a-zA-Z ]+$/.test(line.trim()) && !line.startsWith(' ')) cls = 'text-violet-400';
    else if (line.includes('Library') || line.includes('Resource') || line.includes('Suite')) cls = 'text-teal-400';
    return (
      <span key={idx} className={cn('block leading-relaxed', cls)}>
        {line || '\u00A0'}
      </span>
    );
  };

  const lines = content.split('\n');

  return (
    <div className="flex flex-col h-full">
      {/* toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 flex-shrink-0">
        <span className="text-[10px] font-mono text-zinc-600">workflow.robot — {lines.length} lines</span>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <Copy className="w-3 h-3" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <Download className="w-3 h-3" />
            Download
          </button>
        </div>
      </div>

      {/* code */}
      <div className="flex-1 overflow-auto bg-black/40">
        <div className="flex">
          {/* line numbers */}
          <div className="select-none px-3 py-3 text-right border-r border-white/5 flex-shrink-0">
            {lines.map((_, i) => (
              <div key={i} className="text-[10px] font-mono text-zinc-700 leading-relaxed">
                {i + 1}
              </div>
            ))}
          </div>
          {/* source */}
          <pre className="flex-1 px-4 py-3 text-[11px] font-mono overflow-x-auto whitespace-pre">
            {lines.map((line, i) => colorize(line, i))}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Status indicator bar
// ─────────────────────────────────────────────────────────────

function StatusBar({ state }: { state: ExecutionState }) {
  const { status, completedSteps, totalSteps, currentNodeName } = state;

  const icon = {
    idle: <Clock className="w-3 h-3 text-zinc-600" />,
    running: <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />,
    completed: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
    failed: <XCircle className="w-3 h-3 text-red-400" />,
    stopped: <Square className="w-3 h-3 text-zinc-500" />,
  }[status];

  const label = {
    idle: 'Ready',
    running: currentNodeName ? `Running: ${currentNodeName}` : 'Running…',
    completed: `Done — ${completedSteps}/${totalSteps} steps`,
    failed: 'Failed',
    stopped: 'Stopped',
  }[status];

  const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {icon}
      <span className="text-[10px] text-zinc-400 font-mono truncate">{label}</span>
      {status === 'running' && totalSteps > 0 && (
        <div className="flex-1 max-w-[80px] bg-zinc-800 rounded-full h-1 ml-1 overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component — forwarded ref exposes execute() to WorkflowBuilder
// ─────────────────────────────────────────────────────────────

export const ExecutionPanel = forwardRef<ExecutionPanelHandle, ExecutionPanelProps>(
  function ExecutionPanel(
    {
      isOpen,
      onToggle,
      onClose,
      executionState,
      onRun,
      onStop,
      onRerun,
      onHighlightNode,
      scriptContent = '',
      apiBaseUrl = 'http://localhost:8001',
    },
    ref,
  ) {
    const [tab, setTab] = useState<Tab>('terminal');
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const [maximized, setMaximized] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const termRef = useRef<TerminalHandle>(null);
    const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

    // ── expose handle to parent ────────────────────────────
    useImperativeHandle(ref, () => ({
      execute: (script: string) => {
        setTab('terminal');
        setIsExecuting(true);
        termRef.current?.startExecution(script).finally(() => setIsExecuting(false));
      },
      stop: () => {
        termRef.current?.stopExecution();
        setIsExecuting(false);
      },
    }));

    // ── drag-to-resize ─────────────────────────────────────
    const onMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = { startY: e.clientY, startH: height };
      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const delta = resizeRef.current.startY - ev.clientY;
        setHeight(Math.max(MIN_HEIGHT, resizeRef.current.startH + delta));
      };
      const onUp = () => {
        resizeRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }, [height]);

    // ── keyboard shortcut Ctrl+Enter ──────────────────────
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && scriptContent && !isExecuting) {
          e.preventDefault();
          setTab('terminal');
          setIsExecuting(true);
          termRef.current?.startExecution(scriptContent).finally(() => setIsExecuting(false));
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [scriptContent, isExecuting]);

    if (!isOpen) {
      return (
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-2 px-4 py-2 bg-[#0d0f14] border-t border-white/5 hover:bg-zinc-900/60 transition-colors"
        >
          <Terminal className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-[11px] text-zinc-500 font-mono">EXECUTION</span>
          <ChevronUp className="w-3 h-3 text-zinc-600 ml-auto" />
        </button>
      );
    }

    const panelHeight = maximized ? 'calc(100vh - 140px)' : `${height}px`;

    return (
      <div
        className="flex flex-col bg-[#0a0c10] border-t border-white/5 flex-shrink-0"
        style={{ height: panelHeight, transition: maximized ? 'height 0.15s ease' : undefined }}
      >
        {/* ── Drag handle ─────────────────────────────────── */}
        {!maximized && (
          <div
            className="h-1 bg-transparent hover:bg-zinc-700/50 cursor-ns-resize flex-shrink-0 transition-colors"
            onMouseDown={onMouseDown}
          />
        )}

        {/* ── Panel header ────────────────────────────────── */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5 flex-shrink-0 bg-[#0d0f14]">
          {/* Tabs */}
          {(['terminal', 'script'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-mono transition-colors',
                tab === t
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-400',
              )}
            >
              {t === 'terminal' ? <Terminal className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
              {t}
            </button>
          ))}

          <div className="flex-1 mx-3">
            <StatusBar state={executionState} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* Execute */}
            <button
              onClick={() => {
                if (!scriptContent) { alert('No script generated — add nodes to the canvas first.'); return; }
                setTab('terminal');
                setIsExecuting(true);
                termRef.current?.startExecution(scriptContent).finally(() => setIsExecuting(false));
              }}
              disabled={!scriptContent || isExecuting}
              title="Execute workflow (Ctrl+Enter)"
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold transition-all',
                scriptContent && !isExecuting
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_10px_rgba(52,211,153,0.2)]'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed',
              )}
            >
              {isExecuting
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Play className="w-3 h-3" />}
              {isExecuting ? 'Running' : 'Execute'}
            </button>

            {/* Stop */}
            {isExecuting && (
              <button
                onClick={() => {
                  termRef.current?.stopExecution();
                  setIsExecuting(false);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-red-900/50 hover:bg-red-800/70 text-red-400 border border-red-700/30 transition-all"
              >
                <Square className="w-3 h-3" />
                Stop
              </button>
            )}

            {/* Re-run */}
            {!isExecuting && executionState.status !== 'idle' && scriptContent && (
              <button
                onClick={() => {
                  setTab('terminal');
                  setIsExecuting(true);
                  termRef.current?.startExecution(scriptContent).finally(() => setIsExecuting(false));
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Re-run"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}

            {/* Maximize */}
            <button
              onClick={() => setMaximized(v => !v)}
              className="p-1 rounded hover:bg-zinc-800 transition-colors"
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized
                ? <Minimize2 className="w-3.5 h-3.5 text-zinc-500" />
                : <Maximize2 className="w-3.5 h-3.5 text-zinc-500" />}
            </button>

            {/* Collapse */}
            <button
              onClick={onToggle}
              className="p-1 rounded hover:bg-zinc-800 transition-colors"
              title="Collapse"
            >
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>
          </div>
        </div>

        {/* ── Panel body ──────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'terminal' ? (
            <TerminalView
              ref={termRef}
              apiBaseUrl={apiBaseUrl}
              onComplete={(code) => {
                setIsExecuting(false);
                if (code === 0) onRun();
                else onStop();
              }}
              onError={(err) => {
                setIsExecuting(false);
                console.error('[ExecutionPanel] terminal error:', err);
              }}
            />
          ) : (
            scriptContent
              ? <ScriptViewer content={scriptContent} />
              : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[12px] text-zinc-600 font-mono">
                    Add nodes to the canvas to generate a script.
                  </p>
                </div>
              )
          )}
        </div>
      </div>
    );
  },
);