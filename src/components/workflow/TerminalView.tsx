// src/components/workflow/TerminalView.tsx
// Real terminal emulator using xterm.js + WebSocket

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { cn } from '@/lib/utils';
import { Square, Trash2 } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface TerminalSession {
  sessionId: string;
  scriptPath: string;
  workDir: string;
}

export interface TerminalHandle {
  startExecution: (script: string) => Promise<void>;
  stopExecution: () => void;
  clearTerminal: () => void;
  writeLine: (text: string) => void;
}

interface TerminalViewProps {
  /** Script content to execute */
  scriptContent?: string;
  /** Called when terminal session starts */
  onSessionStart?: (session: TerminalSession) => void;
  /** Called when execution completes */
  onComplete?: (exitCode: number) => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** API base URL */
  apiBaseUrl?: string;
  /** Terminal height */
  height?: number | string;
  /** Whether to auto-start execution */
  autoStart?: boolean;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// Terminal Component
// =============================================================================

export const TerminalView = forwardRef<TerminalHandle, TerminalViewProps>(({
  scriptContent,
  onSessionStart,
  onComplete,
  onError,
  apiBaseUrl = 'http://localhost:8001',
  height = 300,
  autoStart = false,
  className,
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#f59e0b',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#3f3f46',
        black: '#18181b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);
    
    // Initial fit
    setTimeout(() => fitAddon.fit(), 0);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome message
    term.writeln('\x1b[38;5;208m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[38;5;208m║\x1b[0m  \x1b[1;37mOPERATOR\x1b[0m \x1b[38;5;208m_\x1b[0m  \x1b[90mCampaign Execution Terminal\x1b[0m                      \x1b[38;5;208m║\x1b[0m');
    term.writeln('\x1b[38;5;208m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[90mReady for execution.\x1b[0m');
    term.writeln('');

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      term.dispose();
      wsRef.current?.close();
    };
  }, []);

  // Create terminal session and start execution
  const startExecution = useCallback(async (script: string) => {
    const term = xtermRef.current;
    if (!term || isRunning) return;

    setIsRunning(true);
    setExitCode(null);

    term.writeln('\x1b[36m$ Creating execution session...\x1b[0m');

    try {
      // Create session on server
      const response = await fetch(`${apiBaseUrl}/api/terminal/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script_content: script,
          script_name: 'workflow.robot',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      const session = await response.json();
      setSessionId(session.session_id);
      
      onSessionStart?.({
        sessionId: session.session_id,
        scriptPath: session.script_path,
        workDir: session.work_dir,
      });

      term.writeln(`\x1b[90mSession: ${session.session_id}\x1b[0m`);
      term.writeln(`\x1b[90mScript: ${session.script_path}\x1b[0m`);
      term.writeln('');
      term.writeln('\x1b[36m$ python -m robot workflow.robot\x1b[0m');
      term.writeln('');

      // Connect WebSocket
      const wsUrl = `${apiBaseUrl.replace('http', 'ws')}/api/terminal/${session.session_id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        term.writeln('\x1b[32m● Connected to execution server\x1b[0m');
        term.writeln('');
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            handleControlMessage(msg, term);
          } catch {
            term.write(event.data);
          }
        } else if (event.data instanceof Blob) {
          event.data.arrayBuffer().then(buffer => {
            const text = new TextDecoder().decode(buffer);
            term.write(text);
          });
        }
      };

      ws.onerror = () => {
        term.writeln('\x1b[31mWebSocket error\x1b[0m');
        onError?.('WebSocket connection error');
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsRunning(false);
        term.writeln('');
        term.writeln('\x1b[90m● Disconnected from server\x1b[0m');
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      term.writeln(`\x1b[31mError: ${message}\x1b[0m`);
      onError?.(message);
      setIsRunning(false);
    }
  }, [apiBaseUrl, isRunning, onSessionStart, onError]);

  // Auto-start on mount if enabled
  useEffect(() => {
    if (autoStart && scriptContent && xtermRef.current) {
      // Small delay to ensure terminal is ready
      const timer = setTimeout(() => {
        if (!isRunning) {
          startExecution(scriptContent);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []); // Only on mount

  // Handle control messages from server
  const handleControlMessage = useCallback((msg: any, term: Terminal) => {
    switch (msg.type) {
      case 'started':
        term.writeln(`\x1b[90mPID: ${msg.pid}\x1b[0m`);
        break;
      case 'exit':
        setExitCode(msg.code);
        setIsRunning(false);
        term.writeln('');
        if (msg.code === 0) {
          term.writeln('\x1b[32m✓ Execution completed successfully\x1b[0m');
        } else {
          term.writeln(`\x1b[31m✗ Execution failed (exit code: ${msg.code})\x1b[0m`);
        }
        onComplete?.(msg.code);
        break;
      case 'error':
        term.writeln(`\x1b[31mError: ${msg.message}\x1b[0m`);
        onError?.(msg.message);
        break;
      case 'info':
        term.writeln(`\x1b[90m${msg.message}\x1b[0m`);
        break;
    }
  }, [onComplete, onError]);

  // Stop execution
  const stopExecution = useCallback(() => {
    wsRef.current?.close();
    xtermRef.current?.writeln('\x1b[33m⚠ Execution stopped by user\x1b[0m');
    setIsRunning(false);
  }, []);

  // Clear terminal
  const clearTerminal = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  // Write to terminal
  const writeLine = useCallback((text: string) => {
    xtermRef.current?.writeln(text);
  }, []);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    startExecution,
    stopExecution,
    clearTerminal,
    writeLine,
  }), [startExecution, stopExecution, clearTerminal, writeLine]);

  return (
    <div className={cn("flex flex-col bg-[#0a0a0a] rounded-md overflow-hidden h-full", className)}>
      {/* Terminal header with controls */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2"> 
        </div>
        <div className="flex items-center gap-2">
          {/* Stop Button */}
          {isRunning && (
            <button
              onClick={stopExecution}
              className="flex items-center gap-1 px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-medium transition-colors"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          )}
          {/* Clear Button */}
          <button
            onClick={clearTerminal}
            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] font-medium transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
          {/* Status */}
          {isRunning && (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              RUNNING
            </span>
          )}
          {exitCode !== null && (
            <span className={cn(
              "text-[10px] font-mono",
              exitCode === 0 ? "text-green-400" : "text-red-400"
            )}>
              EXIT: {exitCode}
            </span>
          )}
        </div>
      </div>
      
      {/* Terminal content */}
      <div 
        ref={terminalRef} 
        className="flex-1 min-h-0"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      />
    </div>
  );
});

TerminalView.displayName = 'TerminalView';