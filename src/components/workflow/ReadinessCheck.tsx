// src/components/workflow/ReadinessCheck.tsx
// Pre-export gate — surfaces technical and JQR issues before generating .robot file

import { useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';
import { X, CheckCircle2, AlertTriangle, XCircle, Download } from 'lucide-react';
import { JQRProfile, MITRE_TACTICS } from '@/types/campaign';
import { OpforNodeData } from '@/types/opfor';
import { cn } from '@/lib/utils';

interface ReadinessCheckProps {
  nodes: Node[];
  edges: Edge[];
  jqrProfile: JQRProfile | null;
  onConfirm: () => void;
  onClose: () => void;
}

interface CheckResult {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
}

function useReadinessResults(
  nodes: Node[],
  edges: Edge[],
  jqrProfile: JQRProfile | null
) {
  return useMemo(() => {
    const technical: CheckResult[] = [];
    const jqr: CheckResult[]       = [];

    // ── Technical checks ──────────────────────────────────────────────────

    // 1. Has nodes
    technical.push({
      id: 'has-nodes',
      label: 'Canvas has modules',
      status: nodes.length > 0 ? 'pass' : 'fail',
      detail: nodes.length === 0 ? 'Add at least one module to the canvas' : `${nodes.length} module${nodes.length > 1 ? 's' : ''} on canvas`,
    });

    // 2. No orphaned nodes (nodes with no edges at all, excluding single-node canvases)
    if (nodes.length > 1) {
      const connectedIds = new Set([
        ...edges.map(e => e.source),
        ...edges.map(e => e.target),
      ]);
      const orphans = nodes.filter(n => !connectedIds.has(n.id));
      technical.push({
        id: 'no-orphans',
        label: 'All modules connected',
        status: orphans.length === 0 ? 'pass' : 'warn',
        detail: orphans.length > 0
          ? `${orphans.length} unconnected module${orphans.length > 1 ? 's' : ''}: ${orphans.map(n => (n.data as OpforNodeData).definition?.name).join(', ')}`
          : 'All modules wired in sequence',
      });
    }

    // 3. Has Start C2
    const hasStartC2 = nodes.some(n =>
      (n.data as OpforNodeData).definition?.id?.includes('start-c2') ||
      (n.data as OpforNodeData).definition?.name?.toLowerCase().includes('start c2')
    );
    technical.push({
      id: 'has-start-c2',
      label: 'Start C2 present',
      status: hasStartC2 ? 'pass' : 'warn',
      detail: hasStartC2 ? 'C2 initialization module found' : 'No Start C2 module — script will not initialize teamserver',
    });

    // 4. Has Stop C2
    const hasStopC2 = nodes.some(n =>
      (n.data as OpforNodeData).definition?.id?.includes('stop-c2') ||
      (n.data as OpforNodeData).definition?.name?.toLowerCase().includes('stop c2')
    );
    technical.push({
      id: 'has-stop-c2',
      label: 'Stop C2 / teardown present',
      status: hasStopC2 ? 'pass' : 'warn',
      detail: hasStopC2 ? 'Teardown module found' : 'No Stop C2 — campaign will not clean up C2 infrastructure',
    });

    // 5. Required parameters filled
    const missingParams: string[] = [];
    for (const node of nodes) {
      const data   = node.data as OpforNodeData;
      const params = data.definition?.parameters ?? [];
      for (const param of params) {
        if (param.required) {
          const val = data.parameters?.[param.id];
          if (!val || String(val).trim() === '') {
            missingParams.push(`${data.definition?.name}: ${param.label}`);
          }
        }
      }
    }
    technical.push({
      id: 'params-filled',
      label: 'Required parameters configured',
      status: missingParams.length === 0 ? 'pass' : 'warn',
      detail: missingParams.length > 0
        ? `${missingParams.length} required field${missingParams.length > 1 ? 's' : ''} empty: ${missingParams.slice(0, 3).join(', ')}${missingParams.length > 3 ? '...' : ''}`
        : 'All required parameters filled',
    });

    // ── JQR checks ────────────────────────────────────────────────────────

    if (jqrProfile && jqrProfile.requiredTactics.length > 0) {
      // Build coverage map
      const coverage = new Set(
        nodes.map(n => (n.data as OpforNodeData).definition?.tactic).filter(Boolean)
      );

      for (const tacticId of jqrProfile.requiredTactics) {
        const tactic = MITRE_TACTICS.find(t => t.id === tacticId);
        const isCovered = coverage.has(tacticId);
        jqr.push({
          id: `jqr-${tacticId}`,
          label: `${tactic?.label ?? tacticId}`,
          status: isCovered ? 'pass' : 'warn',
          detail: isCovered
            ? `${tacticId} demonstrated on canvas`
            : `${tacticId} required but no module present`,
        });
      }
    }

    const techFails  = technical.filter(c => c.status === 'fail').length;
    const techWarns  = technical.filter(c => c.status === 'warn').length;
    const jqrWarns   = jqr.filter(c => c.status === 'warn').length;
    const canExport  = techFails === 0;

    return { technical, jqr, techFails, techWarns, jqrWarns, canExport };
  }, [nodes, edges, jqrProfile]);
}

export function ReadinessCheck({ nodes, edges, jqrProfile, onConfirm, onClose }: ReadinessCheckProps) {
  const { technical, jqr, techFails, techWarns, jqrWarns, canExport } = useReadinessResults(nodes, edges, jqrProfile);

  const overallStatus =
    techFails > 0  ? 'fail' :
    techWarns > 0 || jqrWarns > 0 ? 'warn' : 'pass';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            {overallStatus === 'pass' && <CheckCircle2 className="h-4 w-4 text-green-400" />}
            {overallStatus === 'warn' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
            {overallStatus === 'fail' && <XCircle className="h-4 w-4 text-red-400" />}
            <span className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider">
              Readiness Check
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">

          {/* Technical */}
          <CheckSection title="Technical" items={technical} />

          {/* JQR */}
          {jqr.length > 0 && (
            <CheckSection
              title={`JQR — ${jqrProfile?.name?.replace('318 RANS ', '') ?? ''}`}
              items={jqr}
            />
          )}
          {jqrProfile && jqrProfile.requiredTactics.length === 0 && (
            <div className="text-[10px] text-zinc-600 font-mono">No JQR profile loaded — skipping qualification check</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800 bg-zinc-900/50">
          <div className="text-[10px] font-mono text-zinc-500">
            {techFails > 0
              ? <span className="text-red-400">{techFails} blocking issue{techFails > 1 ? 's' : ''}</span>
              : techWarns > 0 || jqrWarns > 0
              ? <span className="text-amber-400">{techWarns + jqrWarns} warning{techWarns + jqrWarns > 1 ? 's' : ''} — export allowed</span>
              : <span className="text-green-400">All checks passed</span>
            }
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors font-mono"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!canExport}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold font-mono uppercase tracking-wider transition-colors',
                canExport
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-500/50'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700'
              )}
            >
              <Download className="h-3 w-3" />
              Export .robot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Check section ────────────────────────────────────────────────────────────
function CheckSection({ title, items }: { title: string; items: CheckResult[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold font-mono">{title}</p>
      {items.map(item => (
        <div key={item.id} className="flex items-start gap-2.5">
          <div className="flex-shrink-0 mt-0.5">
            {item.status === 'pass' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
            {item.status === 'warn' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
            {item.status === 'fail' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className={cn(
              'text-[11px] font-medium',
              item.status === 'pass' ? 'text-zinc-300' :
              item.status === 'warn' ? 'text-amber-300' :
              'text-red-300'
            )}>
              {item.label}
            </div>
            {item.detail && (
              <div className="text-[9px] text-zinc-600 font-mono mt-0.5 leading-relaxed">
                {item.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}