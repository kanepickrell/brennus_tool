// src/services/executionService.ts
// Real execution service — no simulation. Talks directly to main.py.
//
// Flow:
//   1. POST /api/terminal/create  →  { session_id, script_path, work_dir }
//   2. WS  /api/terminal/{id}     →  streams terminal output bytes / JSON events
//   3. Caller receives onOutput callbacks + final exit code
//
// The ExecutionPanel calls this via TerminalView (which manages the WS).
// WorkflowBuilder calls executeWorkflow() directly when the Execute button is pressed.

export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export interface ExecutionLogLine {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning' | 'command' | 'output' | 'step';
  message: string;
  nodeId?: string;
  nodeName?: string;
}

export interface ExecutionState {
  status: ExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  currentNodeId?: string;
  currentNodeName?: string;
  progress: number;
  totalSteps: number;
  completedSteps: number;
  logs: ExecutionLogLine[];
  error?: string;
}

export const initialExecutionState: ExecutionState = {
  status: 'idle',
  progress: 0,
  totalSteps: 0,
  completedSteps: 0,
  logs: [],
};

// ─────────────────────────────────────────────────────────────
// Infrastructure status
// ─────────────────────────────────────────────────────────────

export interface InfrastructureState {
  c2Connected: boolean;
  teamserverRunning: boolean;
  robotAvailable: boolean;
  listeners: string[];
  payloads: string[];
  teamserverHost?: string;
  teamserverPid?: number | null;
  csLibraryFound: boolean;
  csLibraryMock: boolean;
  llmAvailable: boolean;
}

export async function checkInfrastructureStatus(
  apiBaseUrl = 'http://localhost:8001',
): Promise<InfrastructureState> {
  try {
    const r = await fetch(`${apiBaseUrl}/api/infrastructure/status`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`${r.status}`);
    const d = await r.json();
    return {
      c2Connected:         d.cobalt_strike?.connected ?? false,
      teamserverRunning:   d.teamserver?.running ?? false,
      robotAvailable:      d.robot_framework?.available ?? false,
      listeners:           [],
      payloads:            [],
      teamserverHost:      d.teamserver?.host ?? undefined,
      teamserverPid:       d.teamserver?.pid ?? null,
      csLibraryFound:      d.cs_library?.found ?? false,
      csLibraryMock:       d.cs_library?.is_mock ?? true,
      llmAvailable:        d.llm?.available ?? false,
    };
  } catch {
    return {
      c2Connected: false,
      teamserverRunning: false,
      robotAvailable: false,
      listeners: [],
      payloads: [],
      csLibraryFound: false,
      csLibraryMock: true,
      llmAvailable: false,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Session creation
// ─────────────────────────────────────────────────────────────

export interface TerminalSession {
  sessionId: string;
  scriptPath: string;
  workDir: string;
  csCredentialsInjected?: boolean;
}

/**
 * POST the .robot script to main.py, which:
 *   1. Copies cobaltstrikec2/ into a temp work dir
 *   2. Injects CS constructor args into the Library declaration (Gap 2 fix)
 *   3. Returns a session_id for the WS connection
 */
export async function createTerminalSession(
  scriptContent: string,
  scriptName = 'workflow.robot',
  apiBaseUrl = 'http://localhost:8001',
): Promise<TerminalSession> {
  const r = await fetch(`${apiBaseUrl}/api/terminal/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script_content: scriptContent, script_name: scriptName }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => r.statusText);
    throw new Error(`Failed to create terminal session: ${text}`);
  }
  const d = await r.json();
  return {
    sessionId:               d.session_id,
    scriptPath:              d.script_path,
    workDir:                 d.work_dir,
    csCredentialsInjected:   d.cs_credentials_injected ?? false,
  };
}

// ─────────────────────────────────────────────────────────────
// WebSocket execution
// ─────────────────────────────────────────────────────────────

export interface ExecuteWorkflowOptions {
  apiBaseUrl?: string;
  scriptName?: string;
  onOutput?: (line: string) => void;
  onComplete?: (exitCode: number) => void;
  onError?: (err: string) => void;
  onSessionCreated?: (session: TerminalSession) => void;
  /** Pass an AbortController.signal to cancel mid-run */
  signal?: AbortSignal;
}

/**
 * Full execute flow: create session → open WS → stream output → resolve on exit.
 *
 * This is called directly from WorkflowBuilder's handleExecute and from
 * TerminalView.startExecution().  Returns the WS so the caller can close it
 * early if needed.
 */
export async function executeWorkflow(
  scriptContent: string,
  {
    apiBaseUrl = 'http://localhost:8001',
    scriptName = 'workflow.robot',
    onOutput,
    onComplete,
    onError,
    onSessionCreated,
    signal,
  }: ExecuteWorkflowOptions = {},
): Promise<WebSocket> {
  // 1. Create session (POST)
  const session = await createTerminalSession(scriptContent, scriptName, apiBaseUrl);
  onSessionCreated?.(session);

  if (!session.csCredentialsInjected) {
    onOutput?.('[warn] CS credentials not injected — set CS_IP and CS_PASS env vars on the server');
  }

  // 2. Open WebSocket
  const wsBase = apiBaseUrl.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsBase}/api/terminal/${session.sessionId}`);

  signal?.addEventListener('abort', () => ws.close());

  ws.binaryType = 'arraybuffer';

  ws.onmessage = (evt) => {
    // Binary → raw terminal bytes (PTY mode)
    if (evt.data instanceof ArrayBuffer) {
      const text = new TextDecoder().decode(evt.data);
      onOutput?.(text);
      return;
    }

    // Text — try JSON event first
    const raw: string = typeof evt.data === 'string' ? evt.data : String(evt.data);
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case 'started':
          onOutput?.(`[lumen] Robot Framework started (PID ${msg.pid})\n`);
          break;
        case 'exit':
          onComplete?.(msg.code ?? 0);
          ws.close();
          break;
        case 'error':
          onError?.(msg.message ?? 'Unknown error');
          ws.close();
          break;
        case 'info':
          onOutput?.(`[lumen] ${msg.message}\n`);
          break;
        default:
          onOutput?.(raw);
      }
    } catch {
      // Not JSON — plain text output line
      onOutput?.(raw);
    }
  };

  ws.onerror = () => {
    onError?.('WebSocket connection error');
  };

  ws.onclose = (ev) => {
    if (ev.code !== 1000 && ev.code !== 1001) {
      // Unexpected close
      onError?.(`WebSocket closed unexpectedly (code ${ev.code})`);
    }
  };

  return ws;
}

// ─────────────────────────────────────────────────────────────
// State reducer helpers (used by WorkflowBuilder)
// ─────────────────────────────────────────────────────────────

export function makeLogLine(
  type: ExecutionLogLine['type'],
  message: string,
  extra?: Partial<ExecutionLogLine>,
): ExecutionLogLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date(),
    type,
    message,
    ...extra,
  };
}

export function executionReducer(
  state: ExecutionState,
  action:
    | { type: 'START'; totalSteps?: number }
    | { type: 'LOG'; line: ExecutionLogLine }
    | { type: 'STEP'; nodeId?: string; nodeName?: string; completedSteps: number }
    | { type: 'COMPLETE' }
    | { type: 'FAIL'; error: string }
    | { type: 'STOP' }
    | { type: 'RESET' },
): ExecutionState {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        status: 'running',
        startedAt: new Date(),
        completedAt: undefined,
        progress: 0,
        totalSteps: action.totalSteps ?? state.totalSteps,
        completedSteps: 0,
        error: undefined,
        logs: [...state.logs, makeLogLine('info', 'Execution started')],
      };
    case 'LOG':
      return { ...state, logs: [...state.logs, action.line] };
    case 'STEP':
      return {
        ...state,
        currentNodeId: action.nodeId,
        currentNodeName: action.nodeName,
        completedSteps: action.completedSteps,
        progress: state.totalSteps > 0
          ? Math.round((action.completedSteps / state.totalSteps) * 100)
          : 0,
      };
    case 'COMPLETE':
      return {
        ...state,
        status: 'completed',
        completedAt: new Date(),
        progress: 100,
        completedSteps: state.totalSteps,
        currentNodeId: undefined,
        currentNodeName: undefined,
        logs: [...state.logs, makeLogLine('success', 'Execution completed successfully')],
      };
    case 'FAIL':
      return {
        ...state,
        status: 'failed',
        completedAt: new Date(),
        error: action.error,
        currentNodeId: undefined,
        currentNodeName: undefined,
        logs: [...state.logs, makeLogLine('error', `Execution failed: ${action.error}`)],
      };
    case 'STOP':
      return {
        ...state,
        status: 'stopped',
        completedAt: new Date(),
        currentNodeId: undefined,
        currentNodeName: undefined,
        logs: [...state.logs, makeLogLine('warning', 'Execution stopped by operator')],
      };
    case 'RESET':
      return { ...initialExecutionState };
    default:
      return state;
  }
}