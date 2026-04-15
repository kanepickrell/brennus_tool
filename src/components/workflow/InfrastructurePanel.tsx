// ============================================================================
// Replace the InfrastructurePanel function and its props interface in
// src/components/workflow/CollapsiblePropertiesPanel.tsx
//
// Also add this import at the top of the file alongside the existing ones:
//   import { useState, useCallback, useEffect } from 'react';
// (useState/useCallback are likely already imported — just add useEffect if missing)
// ============================================================================

// ── Add this constant near the top of CollapsiblePropertiesPanel.tsx ─────────
// const OPERATOR_API = 'http://localhost:8001';

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Replace InfrastructurePanelProps ──────────────────────────────────────────
interface InfrastructurePanelProps {
  nodes: { id: string; data: OpforNodeData }[];
  infrastructureStatus?: InfrastructureState;
  globalSettings: OpforGlobalSettings;
}

// ── Replace analyzeInfrastructure (keep as-is, just verify it exists) ─────────
// function analyzeInfrastructure(...) { ... }   ← no change needed

// ── Replace InfrastructureSection (keep as-is) ────────────────────────────────
// function InfrastructureSection(...) { ... }   ← no change needed

// ── Replace the InfrastructurePanel function entirely ─────────────────────────

function InfrastructurePanel({ nodes, infrastructureStatus, globalSettings }: InfrastructurePanelProps) {
  const OPERATOR_API = 'http://localhost:8001';

  const [tsStatus, setTsStatus] = useState<TeamserverStatusResponse | null>(null);
  const [tsOpPending, setTsOpPending] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const infrastructure = analyzeInfrastructure(nodes);

  // Poll every 5s while panel is mounted
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
        setShowLog(true);          // Auto-open log on start so operator can watch
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
            className={cn("p-1.5 rounded-md hover:bg-zinc-800 transition-colors",
              isRefreshing && "animate-spin")}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-zinc-500" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* ── Teamserver ──────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <span>🎯</span> CS Teamserver
          </h4>

          {/* Status card */}
          <div className={cn("p-3 rounded-md border transition-colors",
            isRunning
              ? "bg-green-500/10 border-green-500/30"
              : "bg-zinc-900/50 border-zinc-800"
          )}>
            <div className="flex items-center gap-3">

              {/* Icon */}
              <div className={cn("p-2 rounded-md flex-shrink-0",
                isRunning ? "bg-green-500/20 text-green-400" : "bg-zinc-800 text-zinc-500")}>
                {isRunning ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              </div>

              {/* Labels */}
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
                    {tsStatus.pid && (
                      <span className="ml-2 text-zinc-600">PID {tsStatus.pid}</span>
                    )}
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

              {/* Start / Stop */}
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

          {/* Log tail toggle */}
          {tsStatus && (
            <div>
              <button
                onClick={() => setShowLog(v => !v)}
                className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600
                           hover:text-zinc-400 transition-colors mt-1"
              >
                <Terminal className="h-3 w-3" />
                {showLog ? "Hide" : "Show"} teamserver log
              </button>

              {showLog && (
                <div className="mt-2 bg-zinc-950 border border-zinc-800 rounded-md
                                p-2.5 max-h-52 overflow-y-auto font-mono">
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

        {/* ── Robot Framework ──────────────────────────────────────────────── */}
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

        {/* ── Active Listeners ─────────────────────────────────────────────── */}
        {(infrastructureStatus?.listeners?.length ?? 0) > 0 && (
          <InfrastructureSection
            title="Active Listeners"
            items={infrastructureStatus!.listeners.map(n => ({ name: n, required: false, status: 'active' as const }))}
            icon="📡"
          />
        )}

        {/* ── Generated Payloads ───────────────────────────────────────────── */}
        {(infrastructureStatus?.payloads?.length ?? 0) > 0 && (
          <InfrastructureSection
            title="Generated Payloads"
            items={infrastructureStatus!.payloads.map(n => ({ name: n, required: false, status: 'active' as const }))}
            icon="📦"
          />
        )}

        {/* ── Required by canvas nodes ──────────────────────────────────────── */}
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