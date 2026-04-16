// src/components/workflow/InfrastructurePanel.tsx
// Real infrastructure management — talks directly to main.py API endpoints.
// Replaces the old read-only status panel with full start/stop control.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Server, Play, Square, RefreshCw, Wifi, WifiOff,
  Terminal, CheckCircle2, XCircle, AlertCircle, Loader2,
  ChevronDown, ChevronRight, Eye, EyeOff, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OpforGlobalSettings } from '@/types/opfor';

// ─────────────────────────────────────────────────────────────
// Types matching /api/infrastructure/status and /api/c2/teamserver/status
// ─────────────────────────────────────────────────────────────

interface TeamserverStatus {
  running: boolean;
  pid: number | null;
  host: string | null;
  port: number;
  binary_exists: boolean;
  binary_path: string;
  cs_dir: string;
  cs_library: { path: string | null; found: boolean; is_mock: boolean };
  log_path: string;
  log_tail: string[];
}

interface InfraStatus {
  robot_framework: { available: boolean; status: string; executable: string };
  cobalt_strike: { available: boolean; connected: boolean; listeners: number; payloads: number };
  teamserver: TeamserverStatus;
  cs_library: { path: string | null; found: boolean; is_mock: boolean; configured_path: string };
  llm: { available: boolean; host: string; model: string };
  script_builder: { available: boolean };
}

interface InfrastructurePanelProps {
  globalSettings: OpforGlobalSettings;
  onSettingsChange: (s: OpforGlobalSettings) => void;
  apiBaseUrl?: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const API = (base: string, path: string) => `${base}${path}`;

function StatusDot({ ok, pulse }: { ok: boolean; pulse?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full flex-shrink-0',
        ok ? 'bg-emerald-400' : 'bg-zinc-600',
        ok && pulse && 'animate-pulse',
      )}
    />
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wide',
        ok
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
          : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50',
      )}
    >
      <StatusDot ok={ok} pulse={ok} />
      {label}
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  expanded,
  onToggle,
}: {
  icon: React.ElementType;
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 py-1.5 text-left group"
    >
      {expanded
        ? <ChevronDown className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
        : <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />}
      <Icon className="w-3.5 h-3.5 text-zinc-500" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">
        {label}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function InfrastructurePanel({
  globalSettings,
  onSettingsChange,
  apiBaseUrl = 'http://localhost:8001',
}: InfrastructurePanelProps) {
  const [status, setStatus] = useState<InfraStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tsAction, setTsAction] = useState<'starting' | 'stopping' | null>(null);
  const [logTail, setLogTail] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [sections, setSections] = useState({ teamserver: true, robot: false, llm: false });
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── fetch full infra status ──────────────────────────────
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const r = await fetch(API(apiBaseUrl, '/api/infrastructure/status'));
      if (!r.ok) throw new Error(`${r.status}`);
      const d: InfraStatus = await r.json();
      setStatus(d);
      setLogTail(d.teamserver.log_tail ?? []);
      setLastRefresh(new Date());
    } catch {
      // server unreachable — keep old state
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [apiBaseUrl]);

  // ── poll every 5 s ──────────────────────────────────────
  useEffect(() => {
    refresh();
    pollRef.current = setInterval(() => refresh(true), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  // ── auto-scroll log tail ─────────────────────────────────
  useEffect(() => {
    if (showLogs && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logTail, showLogs]);

  // ── start teamserver ─────────────────────────────────────
  const handleStart = async () => {
    if (!globalSettings.csIp || !globalSettings.csPass) {
      alert('Set CS IP and CS Password in the settings fields below before starting the teamserver.');
      return;
    }
    setTsAction('starting');
    try {
      const r = await fetch(API(apiBaseUrl, '/api/c2/teamserver/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: globalSettings.csIp,
          password: globalSettings.csPass,
          cs_dir: globalSettings.csDir ?? '/opt/cobaltstrike',
        }),
      });
      const d = await r.json();
      if (!d.success) alert(`Failed to start teamserver: ${d.error ?? 'unknown error'}`);
      else {
        // poll more frequently right after start
        setTimeout(() => refresh(true), 2000);
        setTimeout(() => refresh(true), 5000);
        setTimeout(() => refresh(true), 10000);
      }
    } catch (e) {
      alert(`Request failed: ${e}`);
    } finally {
      setTsAction(null);
    }
  };

  // ── stop teamserver ──────────────────────────────────────
  const handleStop = async () => {
    if (!confirm('Stop the Cobalt Strike teamserver? All active beacons will lose their C2 connection.')) return;
    setTsAction('stopping');
    try {
      const r = await fetch(API(apiBaseUrl, '/api/c2/teamserver/stop'), { method: 'POST' });
      const d = await r.json();
      if (!d.success) alert(`Failed to stop teamserver: ${d.error}`);
      else setTimeout(() => refresh(true), 2000);
    } catch (e) {
      alert(`Request failed: ${e}`);
    } finally {
      setTsAction(null);
    }
  };

  // ── settings helpers ─────────────────────────────────────
  const set = (key: keyof OpforGlobalSettings, val: string) =>
    onSettingsChange({ ...globalSettings, [key]: val });

  const ts = status?.teamserver;
  const rf = status?.robot_framework;
  const llm = status?.llm;
  const lib = status?.cs_library;

  return (
    <div className="h-full flex flex-col bg-[#0d0f14] overflow-hidden">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-orange-400" />
          <span className="text-xs font-semibold text-zinc-200 tracking-wide">Infrastructure</span>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[10px] text-zinc-600 font-mono">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => refresh()}
            disabled={loading}
            className="p-1 rounded hover:bg-white/5 transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-zinc-500', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* ─ Teamserver Section ─ */}
        <div>
          <SectionHeader
            icon={Server}
            label="Cobalt Strike Teamserver"
            expanded={sections.teamserver}
            onToggle={() => setSections(s => ({ ...s, teamserver: !s.teamserver }))}
          />

          {sections.teamserver && (
            <div className="mt-2 space-y-3 pl-1">
              {/* Status card */}
              <div
                className={cn(
                  'rounded-lg border p-3 transition-all',
                  ts?.running
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-zinc-900/60 border-zinc-800/60',
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {ts?.running
                      ? <Wifi className="w-4 h-4 text-emerald-400" />
                      : <WifiOff className="w-4 h-4 text-zinc-500" />}
                    <span className={cn('text-xs font-semibold', ts?.running ? 'text-emerald-400' : 'text-zinc-400')}>
                      {loading && !ts ? 'Checking…' : ts?.running ? 'Running' : 'Stopped'}
                    </span>
                    {ts?.pid && (
                      <span className="text-[10px] font-mono text-zinc-600">PID {ts.pid}</span>
                    )}
                  </div>

                  {/* Start / Stop buttons */}
                  <div className="flex gap-1.5">
                    {!ts?.running ? (
                      <button
                        onClick={handleStart}
                        disabled={tsAction !== null}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-all',
                          tsAction === 'starting'
                            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_8px_rgba(52,211,153,0.25)]',
                        )}
                      >
                        {tsAction === 'starting'
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Play className="w-3 h-3" />}
                        {tsAction === 'starting' ? 'Starting…' : 'Start'}
                      </button>
                    ) : (
                      <button
                        onClick={handleStop}
                        disabled={tsAction !== null}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-all',
                          tsAction === 'stopping'
                            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                            : 'bg-red-900/60 hover:bg-red-800/80 text-red-400 border border-red-700/30',
                        )}
                      >
                        {tsAction === 'stopping'
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Square className="w-3 h-3" />}
                        {tsAction === 'stopping' ? 'Stopping…' : 'Stop'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Connection detail */}
                {ts?.running && ts.host && (
                  <div className="font-mono text-[10px] text-zinc-500 space-y-0.5">
                    <div><span className="text-zinc-600">host</span> {ts.host}:{ts.port}</div>
                    <div><span className="text-zinc-600">dir&nbsp;</span> {ts.cs_dir}</div>
                  </div>
                )}

                {/* Library warning */}
                {lib?.is_mock && (
                  <div className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-500/80">
                    <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span>Using mock CS library — set <code className="font-mono">CS_LIBRARY_DIR</code> to point at the real cobaltstrikec2/</span>
                  </div>
                )}
                {lib && !lib.found && (
                  <div className="mt-2 flex items-start gap-1.5 text-[10px] text-red-400/80">
                    <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span>CS library not found at <code className="font-mono">{lib.configured_path}</code></span>
                  </div>
                )}
              </div>

              {/* Credentials / connection settings */}
              <div className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Connection</span>

                <div className="grid grid-cols-2 gap-2">
                  {/* CS IP */}
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500 font-mono">CS_IP</span>
                    <input
                      type="text"
                      value={globalSettings.csIp ?? ''}
                      onChange={e => set('csIp', e.target.value)}
                      placeholder="10.10.104.30"
                      className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
                    />
                  </label>

                  {/* CS Port */}
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500 font-mono">CS_PORT</span>
                    <input
                      type="text"
                      value={globalSettings.csPort ?? '50050'}
                      onChange={e => set('csPort', e.target.value)}
                      placeholder="50050"
                      className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
                    />
                  </label>

                  {/* CS User */}
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500 font-mono">CS_USER</span>
                    <input
                      type="text"
                      value={globalSettings.csUser ?? ''}
                      onChange={e => set('csUser', e.target.value)}
                      placeholder="operator"
                      className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
                    />
                  </label>

                  {/* CS Pass */}
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500 font-mono">CS_PASS</span>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={globalSettings.csPass ?? ''}
                        onChange={e => set('csPass', e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 pr-7 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(v => !v)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        {showPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  </label>
                </div>

                {/* CS Dir */}
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-zinc-500 font-mono">CS_DIR</span>
                  <input
                    type="text"
                    value={globalSettings.csDir ?? '/opt/cobaltstrike'}
                    onChange={e => set('csDir', e.target.value)}
                    placeholder="/opt/cobaltstrike"
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                </label>
              </div>

              {/* Log tail toggle */}
              <div>
                <button
                  onClick={() => setShowLogs(v => !v)}
                  className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <Terminal className="w-3 h-3" />
                  {showLogs ? 'Hide' : 'Show'} teamserver log
                </button>
                {showLogs && (
                  <div
                    ref={logRef}
                    className="mt-1.5 bg-black/60 border border-zinc-800/60 rounded p-2 h-28 overflow-y-auto"
                  >
                    {logTail.length === 0 ? (
                      <p className="text-[10px] text-zinc-700 font-mono">No log output yet.</p>
                    ) : (
                      logTail.map((line, i) => (
                        <p key={i} className="text-[10px] font-mono text-zinc-400 leading-relaxed whitespace-pre-wrap">
                          {line}
                        </p>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─ Robot Framework Section ─ */}
        <div>
          <SectionHeader
            icon={Terminal}
            label="Robot Framework"
            expanded={sections.robot}
            onToggle={() => setSections(s => ({ ...s, robot: !s.robot }))}
          />
          {sections.robot && (
            <div className="mt-2 pl-1 space-y-2">
              <div className="flex items-center justify-between">
                <StatusBadge ok={!!rf?.available} label={rf?.available ? 'Installed' : 'Not found'} />
                {rf?.executable && (
                  <span className="text-[10px] font-mono text-zinc-600 truncate ml-2 max-w-[160px]">
                    {rf.executable.split('/').pop()}
                  </span>
                )}
              </div>
              {rf?.available && (
                <p className="text-[10px] font-mono text-zinc-600">{rf.status}</p>
              )}
              {!rf?.available && (
                <p className="text-[10px] text-zinc-600">
                  Run <code className="font-mono text-zinc-500">pip install robotframework</code> to install.
                </p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600">Script builder:</span>
                <StatusBadge ok={!!status?.script_builder?.available} label={status?.script_builder?.available ? 'Ready' : 'Missing'} />
              </div>
            </div>
          )}
        </div>

        {/* ─ LLM Section ─ */}
        <div>
          <SectionHeader
            icon={Wifi}
            label="LLM / Ollama"
            expanded={sections.llm}
            onToggle={() => setSections(s => ({ ...s, llm: !s.llm }))}
          />
          {sections.llm && (
            <div className="mt-2 pl-1 space-y-2">
              <div className="flex items-center gap-2">
                <StatusBadge ok={!!llm?.available} label={llm?.available ? 'Connected' : 'Unreachable'} />
              </div>
              {llm && (
                <div className="font-mono text-[10px] text-zinc-600 space-y-0.5">
                  <div><span className="text-zinc-700">host&nbsp;</span>{llm.host}</div>
                  <div><span className="text-zinc-700">model</span> {llm.model}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer summary ──────────────────────────────────── */}
      <div className="border-t border-white/5 px-4 py-2 flex-shrink-0 flex items-center gap-3">
        <StatusDot ok={!!ts?.running} pulse={ts?.running} />
        <span className="text-[10px] text-zinc-600 font-mono">
          {ts?.running ? `teamserver @ ${ts.host}` : 'teamserver offline'}
        </span>
        <span className="ml-auto">
          <StatusDot ok={!!rf?.available} />
        </span>
        <span className="text-[10px] text-zinc-600 font-mono">rf</span>
      </div>
    </div>
  );
}