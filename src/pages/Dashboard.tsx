// src/pages/Dashboard.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Download, Trash2, ChevronRight,
         Shield, Clock, Layers, MoreHorizontal, Search, SlidersHorizontal, Activity } from 'lucide-react';
import { CampaignConfig } from '@/types/campaign';
import { C2_BADGE } from '@/constants/c2';
import { MITRE_TACTICS } from '@/types/campaign';
import {
  getCampaignIndex, deleteCampaignFromIndex,
  exportCampaignFile, importCampaignFile,
} from '@/lib/campaignStorage';
import { cn } from '@/lib/utils';

// ── Shared LUMEN header styles (matches OperatorHeader branding) ─────────────
const LUMEN_HEADER_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&family=Share+Tech+Mono&display=swap');
  .lumen-header {
    height: 72px;
    background: #09090b;
    border-bottom: 1px solid #27272a;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 32px;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
  }
  .lumen-header::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, #ffffff08 1px, transparent 1px),
      linear-gradient(to bottom, #ffffff08 1px, transparent 1px);
    background-size: 24px 24px;
    pointer-events: none;
  }
  .lumen-header::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(to right, transparent, #f59e0b55, transparent);
  }
  .lumen-wordmark { display: flex; flex-direction: column; line-height: 1; position: relative; z-index: 1; }
  .lumen-wordmark-primary { display: flex; align-items: center; }
  .lumen-wordmark-text {
    font-family: "Rajdhani", sans-serif;
    font-weight: 500;
    font-size: 26px;
    letter-spacing: 0.28em;
    color: #ffffff;
    text-transform: uppercase;
    line-height: 1;
  }
  .lumen-wordmark-rays {
    display: block;
    flex-shrink: 0;
    overflow: visible;
    margin-top: 4px;
  }
  .lumen-wordmark-sub { display: flex; align-items: center; gap: 6px; margin-top: 5px; }
  .lumen-sub-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #f59e0b;
    letter-spacing: 0.22em; text-transform: uppercase;
  }
  .lumen-sub-tick { width: 1px; height: 8px; background: #3f3f46; flex-shrink: 0; }
  .lumen-sub-version {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #52525b;
    letter-spacing: 0.12em; text-transform: uppercase;
  }
  .lumen-header-right { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
  .lumen-mono-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  }
`;

// ── Tactic heatmap mini-bar ──────────────────────────────────────────────────
function TacticMinimap({ covered, required }: { covered: string[]; required: string[] }) {
  return (
    <div className="flex gap-0.5">
      {MITRE_TACTICS.map(t => {
        const isRequired = required.includes(t.id);
        const isCovered  = covered.includes(t.id);
        return (
          <div
            key={t.id}
            title={`${t.label}${isRequired ? ' (required)' : ''}`}
            className={cn(
              'w-2.5 h-2.5 rounded-sm transition-colors',
              isCovered && isRequired  ? 'bg-green-500'          :
              !isCovered && isRequired ? 'bg-amber-500/70'       :
              isCovered                ? 'bg-zinc-500'           :
                                         'bg-zinc-800'
            )}
          />
        );
      })}
    </div>
  );
}

// ── JQR progress bar ─────────────────────────────────────────────────────────
function JQRBar({ campaign }: { campaign: CampaignConfig }) {
  const required = campaign.jqrProfile?.requiredTactics ?? [];
  if (required.length === 0) return <span className="text-[10px] text-zinc-600">No JQR</span>;
  const covered = required.filter(t => campaign.tacticsCovered?.includes(t)).length;
  const pct     = Math.round((covered / required.length) * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">
          {campaign.jqrProfile.name.replace('318 RANS ', '')}
        </span>
        <span className={cn(
          'text-[9px] font-bold',
          pct === 100 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-zinc-500'
        )}>
          {covered}/{required.length}
        </span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-zinc-600'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Campaign card ────────────────────────────────────────────────────────────
function CampaignCard({
  campaign,
  onOpen,
  onExport,
  onDelete,
}: {
  campaign: CampaignConfig;
  onOpen: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const c2Badge = C2_BADGE[campaign.c2Framework];
  const required = campaign.jqrProfile?.requiredTactics ?? [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const relativeDate = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 2)   return 'just now';
    if (mins  < 60)  return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    if (days  < 30)  return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/60',
        'hover:border-zinc-600 hover:bg-zinc-900 transition-all duration-200 cursor-pointer',
        'overflow-hidden'
      )}
      onClick={onOpen}
    >
      {/* Canvas preview area */}
      <div className="relative h-36 bg-zinc-950 border-b border-zinc-800 overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle, #52525b 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <TacticMinimap covered={campaign.tacticsCovered ?? []} required={required} />
          <div className="flex items-center gap-1.5">
            {c2Badge && (
              <span
                style={{
                  fontSize: '9px', fontWeight: 700, padding: '1px 6px',
                  borderRadius: '4px', background: c2Badge.hex + '22',
                  color: c2Badge.hex, border: `1px solid ${c2Badge.hex}55`,
                }}
              >
                {c2Badge.abbr}
              </span>
            )}
            <span className="text-[10px] text-zinc-500 font-mono">
              {campaign.nodeCount ?? 0} nodes
            </span>
          </div>
        </div>
        <div
          ref={menuRef}
          className="absolute top-2 right-2"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen(v => !v)}
            className={cn(
              'p-1 rounded-md text-zinc-600 transition-colors',
              'opacity-0 group-hover:opacity-100',
              'hover:bg-zinc-800 hover:text-zinc-300',
              menuOpen && 'opacity-100 bg-zinc-800 text-zinc-300'
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 w-36 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-10 overflow-hidden">
              <button
                onClick={onOpen}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <Layers className="h-3 w-3" /> Open
              </button>
              <button
                onClick={onExport}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <Download className="h-3 w-3" /> Export .lumen
              </button>
              <div className="border-t border-zinc-700" />
              <button
                onClick={onDelete}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-red-400 hover:bg-zinc-700 transition-colors"
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2.5 flex-1 flex flex-col">
        <div>
          <h3 className="text-[13px] font-semibold text-zinc-100 truncate leading-tight">
            {campaign.name}
          </h3>
          <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
            {campaign.operatorName || 'Unknown operator'} · {campaign.rangeEnvironment || 'No range set'}
          </p>
        </div>

        <div className="flex-1">
          <JQRBar campaign={campaign} />
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
          <span className="text-[9px] text-zinc-600 font-mono flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {relativeDate(campaign.updatedAt)}
          </span>
          <ChevronRight className="h-3 w-3 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
        </div>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
        <Shield className="h-7 w-7 text-zinc-600" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-200 mb-2">No campaigns yet</h2>
      <p className="text-sm text-zinc-500 max-w-xs mb-8 leading-relaxed">
        Start a new campaign to build and track your red team scenarios, or import an existing <code className="text-zinc-400">.lumen</code> file.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#e05c00] hover:bg-[#c75200] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" /> New Campaign
        </button>
        <button
          onClick={onImport}
          className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors"
        >
          <Upload className="h-4 w-4" /> Import .lumen
        </button>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignConfig[]>([]);
  const [search, setSearch]       = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setCampaigns(getCampaignIndex());
  }, []);

  const filtered = campaigns.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.operatorName?.toLowerCase().includes(search.toLowerCase()) ||
    c.rangeEnvironment?.toLowerCase().includes(search.toLowerCase())
  );

  const handleImport = async () => {
    setImporting(true);
    try {
      const campaign = await importCampaignFile();
      setCampaigns(getCampaignIndex());
      navigate(`/campaign/${campaign.id}`);
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    deleteCampaignFromIndex(id);
    setCampaigns(getCampaignIndex());
  };

  const totalNodes    = campaigns.reduce((s, c) => s + (c.nodeCount ?? 0), 0);
  const completedJQRs = campaigns.filter(c => c.jqrProgress >= 100).length;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <style>{LUMEN_HEADER_STYLES}</style>

      {/* ── Top nav ── */}
      <header className="lumen-header">

        {/* LEFT: Wordmark */}
        <div className="lumen-wordmark">
          <div className="lumen-wordmark-primary">
            <span className="lumen-wordmark-text">LUMEN</span>

            {/*
              Camino shell rays — D4 geometry, refined.
              viewBox 0 0 24 18, origin (0,13) = base of N.
              Fan rotated ~15° clockwise vs D4 so upper rays
              echo the N diagonal (N stroke runs ~top-left to bottom-right).
              Opacities lifted: floor raised from 0.22 to 0.38.

              D4 original → rotated +15° clockwise:
                Ray 1: was (7,1)   → (9,3)   0.7px  op 0.38
                Ray 2: was (10,2)  → (12,4)  1.0px  op 0.54
                Ray 3: was (13,6)  → (14,7)  1.6px  op 0.72
                Ray 4: was (15,10) → (15,11) 2.1px  op 0.90
                Ray 5: stays (16,13)         2.8px  op 1.0
            */}
            <svg
  className="lumen-wordmark-rays"
  width="24"
  height="18"
  viewBox="0 0 24 18"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <circle cx="0" cy="13" r="1.4" fill="#f59e0b" opacity="0.85" />

  <line
    x1="0" y1="13"
    x2="6" y2="0"
    stroke="#f59e0b"
    strokeWidth="0.7"
    strokeLinecap="round"
    opacity="0.38"
  />

  <line
    x1="0"  y1="13"
    x2="9" y2="1"
    stroke="#f59e0b"
    strokeWidth="1.0"
    strokeLinecap="round"
    opacity="0.54"
  />

  <line
    x1="0"  y1="13"
    x2="12" y2="4"
    stroke="#f59e0b"
    strokeWidth="1.6"
    strokeLinecap="round"
    opacity="0.72"
  />

  <line
    x1="0"  y1="13"
    x2="14" y2="9"
    stroke="#f59e0b"
    strokeWidth="2.1"
    strokeLinecap="round"
    opacity="0.90"
  />

  <line
    x1="0"  y1="13"
    x2="16" y2="13"
    stroke="#f59e0b"
    strokeWidth="2.8"
    strokeLinecap="round"
  />
</svg>
          </div>
          <div className="lumen-wordmark-sub">
            <span className="lumen-sub-label">Campaign Studio</span>
            <div className="lumen-sub-tick" />
            <span className="lumen-sub-version">V1.0.0</span>
          </div>
        </div>

        {/* RIGHT: actions */}
        <div className="lumen-header-right">
          <button
            onClick={handleImport}
            disabled={importing}
            className="lumen-mono-btn flex items-center gap-1.5 px-3 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded transition-colors"
          >
            <Upload className="h-3 w-3" />
            {importing ? 'Importing...' : 'Import .lumen'}
          </button>
          <button
            onClick={() => navigate('/new')}
            className="lumen-mono-btn flex items-center gap-1.5 px-4 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-500/50 rounded transition-colors"
          >
            <Plus className="h-3 w-3" /> New Campaign
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <aside className="w-52 flex-shrink-0 border-r border-zinc-800 flex flex-col py-4 px-3 gap-1">
          <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold px-2 mb-1">
            Workspace
          </p>
          <NavItem icon={<Layers className="h-3.5 w-3.5" />} label="All Campaigns" active />
          <NavItem icon={<Activity className="h-3.5 w-3.5" />} label="Recent" />
          <NavItem icon={<Shield className="h-3.5 w-3.5" />} label="JQR Tracked" />

          <div className="mt-auto pt-4 border-t border-zinc-800 space-y-3 px-1">
            <Stat label="Total Campaigns" value={campaigns.length} />
            <Stat label="JQRs Complete"   value={completedJQRs} />
            <Stat label="Nodes Authored"  value={totalNodes} />
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">

            {campaigns.length > 0 && (
              <div className="flex items-center gap-3 mb-6">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search campaigns..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                </div>
                <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border border-zinc-800 rounded-lg transition-colors">
                  <SlidersHorizontal className="h-3 w-3" /> Filter
                </button>
                <span className="text-[10px] text-zinc-600 ml-auto">
                  {filtered.length} campaign{filtered.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {campaigns.length === 0 ? (
              <EmptyState onNew={() => navigate('/new')} onImport={handleImport} />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <p className="text-sm text-zinc-500">No campaigns match &ldquo;{search}&rdquo;</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {filtered.map(campaign => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    onOpen={() => navigate(`/campaign/${campaign.id}`)}
                    onExport={() => exportCampaignFile(campaign)}
                    onDelete={() => handleDelete(campaign.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────
function NavItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={cn(
      'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors text-left',
      active
        ? 'bg-zinc-800 text-zinc-100'
        : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
    )}>
      {icon} {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-sm font-bold text-zinc-200">{value}</div>
      <div className="text-[9px] text-zinc-600 uppercase tracking-wider">{label}</div>
    </div>
  );
}