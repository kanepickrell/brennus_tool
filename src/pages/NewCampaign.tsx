// src/pages/NewCampaign.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Shield,
         Server, FileText, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CampaignConfig, JQRProfile, JQR_PRESETS,
  MITRE_TACTICS, DEFAULT_C2_CONFIG, C2Framework,
} from '@/types/campaign';
import { C2_BADGE } from '@/constants/c2';
import { generateCampaignId, saveCampaignToIndex } from '@/lib/campaignStorage';

// ── Step indicator ───────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Identity',  icon: FileText },
  { id: 2, label: 'JQR',       icon: Shield   },
  { id: 3, label: 'C2 Config', icon: Server   },
  { id: 4, label: 'Launch',    icon: Zap      },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const done    = current > step.id;
        const active  = current === step.id;
        const Icon    = step.icon;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                done   ? 'bg-[#e05c00] border-[#e05c00]'   :
                active ? 'bg-zinc-900 border-[#e05c00]'      :
                         'bg-zinc-900 border-zinc-700'
              )}>
                {done
                  ? <Check className="h-3.5 w-3.5 text-white" />
                  : <Icon className={cn('h-3.5 w-3.5', active ? 'text-[#e05c00]' : 'text-zinc-600')} />
                }
              </div>
              <span className={cn(
                'text-[9px] uppercase tracking-widest font-bold',
                active ? 'text-zinc-200' : done ? 'text-zinc-400' : 'text-zinc-600'
              )}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                'w-16 h-px mb-5 mx-2 transition-colors duration-300',
                current > step.id ? 'bg-[#e05c00]' : 'bg-zinc-800'
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Identity & Context ───────────────────────────────────────────────
function StepIdentity({
  name, setName,
  operator, setOperator,
  range, setRange,
}: {
  name: string; setName: (v: string) => void;
  operator: string; setOperator: (v: string) => void;
  range: string; setRange: (v: string) => void;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 mb-1">Name your campaign</h2>
        <p className="text-sm text-zinc-500">
          Give this campaign a name, associate it with an operator, and describe the target range.
        </p>
      </div>

      <div className="space-y-5">
        <Field label="Campaign Name" required>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Hunt 1 — Alpha Range Q2"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#e05c00] transition-colors"
          />
        </Field>

        <Field label="Operator / Trainee Name">
          <input
            value={operator}
            onChange={e => setOperator(e.target.value)}
            placeholder="Callsign or full name"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </Field>

        <Field label="Range / Environment">
          <input
            value={range}
            onChange={e => setRange(e.target.value)}
            placeholder="e.g. NetworkSimspace Dev Range, Alpha AD Environment"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </Field>
      </div>
    </div>
  );
}

// ── Step 2: JQR Profile ──────────────────────────────────────────────────────
function StepJQR({
  selectedProfile, setSelectedProfile,
  customTactics, setCustomTactics,
}: {
  selectedProfile: JQRProfile;
  setSelectedProfile: (p: JQRProfile) => void;
  customTactics: string[];
  setCustomTactics: (t: string[]) => void;
}) {
  const isCustom = selectedProfile.id === 'custom';

  const handlePresetChange = (presetId: string) => {
    const preset = JQR_PRESETS.find(p => p.id === presetId)!;
    setSelectedProfile(preset);
    if (presetId !== 'custom') setCustomTactics(preset.requiredTactics);
  };

  const toggleTactic = (id: string) => {
    const next = customTactics.includes(id)
      ? customTactics.filter(t => t !== id)
      : [...customTactics, id];
    setCustomTactics(next);
    if (!isCustom) setSelectedProfile({ ...JQR_PRESETS.find(p => p.id === 'custom')! });
  };

  const activeTactics = isCustom ? customTactics : selectedProfile.requiredTactics;

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 mb-1">JQR Requirements</h2>
        <p className="text-sm text-zinc-500">
          Load a qualification profile or define which ATT&CK tactics this campaign must demonstrate.
          The heatmap and progress panel will track coverage against these requirements.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
          Load Profile
        </label>
        <div className="grid grid-cols-1 gap-2">
          {JQR_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => handlePresetChange(preset.id)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                selectedProfile.id === preset.id
                  ? 'bg-[#e05c00]/10 border-[#e05c00]/60 text-zinc-100'
                  : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
                selectedProfile.id === preset.id ? 'border-[#e05c00]' : 'border-zinc-600'
              )}>
                {selectedProfile.id === preset.id && (
                  <div className="w-2 h-2 rounded-full bg-[#e05c00]" />
                )}
              </div>
              <div>
                <div className="text-xs font-semibold">{preset.name}</div>
                {preset.description && (
                  <div className="text-[10px] text-zinc-500 mt-0.5">{preset.description}</div>
                )}
                {preset.id !== 'custom' && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {preset.requiredTactics.map(t => (
                      <span key={t} className="text-[8px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded font-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
          Required Tactics {!isCustom && <span className="text-zinc-600 normal-case">(edit to customize)</span>}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {MITRE_TACTICS.map(tactic => {
            const checked = activeTactics.includes(tactic.id);
            return (
              <button
                key={tactic.id}
                onClick={() => toggleTactic(tactic.id)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all',
                  checked
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                    : 'bg-zinc-900/30 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400'
                )}
              >
                <div className={cn(
                  'w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center',
                  checked ? 'bg-[#e05c00] border-[#e05c00]' : 'border-zinc-600'
                )}>
                  {checked && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <span className="text-[9px] font-mono text-zinc-500">{tactic.id}</span>
                <span className="text-[10px] font-medium truncate">{tactic.label}</span>
                <span className="ml-auto text-xs">{tactic.icon}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-zinc-600">
          {activeTactics.length} tactic{activeTactics.length !== 1 ? 's' : ''} required
        </p>
      </div>
    </div>
  );
}

// ── Step 3: C2 Configuration ─────────────────────────────────────────────────
function StepC2({
  framework, setFramework,
  config, setConfig,
}: {
  framework: C2Framework;
  setFramework: (f: C2Framework) => void;
  config: typeof DEFAULT_C2_CONFIG;
  setConfig: (c: typeof DEFAULT_C2_CONFIG) => void;
}) {
  const frameworks: { id: C2Framework; label: string; desc: string }[] = [
    { id: 'cobalt_strike', label: 'Cobalt Strike', desc: 'Primary C2 — beacon-based operations' },
    { id: 'sliver',        label: 'Sliver',         desc: 'Open-source adversary emulation' },
    { id: 'havoc',         label: 'Havoc',           desc: 'Modern C2 framework' },
    { id: 'ssh',           label: 'SSH / Direct',    desc: 'No C2 beacon — direct SSH access' },
  ];

  const update = (key: keyof typeof DEFAULT_C2_CONFIG) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setConfig({ ...config, [key]: e.target.value });

  const showCSFields = framework === 'cobalt_strike';

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 mb-1">C2 Framework</h2>
        <p className="text-sm text-zinc-500">
          Select the command-and-control framework for this campaign. This determines which
          Docker container is started and which Robot Framework library is used.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Framework</label>
        <div className="grid grid-cols-2 gap-2">
          {frameworks.map(f => {
            const badge = C2_BADGE[f.id];
            const active = framework === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFramework(f.id)}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                  active
                    ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-900/30 text-zinc-500 hover:border-zinc-700'
                )}
                style={active && badge ? {
                  borderColor: badge.hex + '80',
                  background: badge.hex + '11',
                } : undefined}
              >
                <div className={cn(
                  'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
                  active ? 'border-current' : 'border-zinc-600'
                )}
                style={active && badge ? { borderColor: badge.hex } : undefined}
                >
                  {active && (
                    <div className="w-2 h-2 rounded-full"
                      style={badge ? { background: badge.hex } : { background: '#e05c00' }} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{f.label}</span>
                    {badge && (
                      <span className="text-[8px] font-bold px-1 rounded"
                        style={{ color: badge.hex, background: badge.hex + '22' }}>
                        {badge.abbr}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{f.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {showCSFields && (
        <div className="space-y-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            Cobalt Strike Connection
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teamserver IP">
              <input value={config.csIp} onChange={update('csIp')}
                placeholder="10.50.100.5"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-500 transition-colors" />
            </Field>
            <Field label="Port">
              <input value={config.csPort} onChange={update('csPort')}
                placeholder="50050"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-500 transition-colors" />
            </Field>
            <Field label="Username">
              <input value={config.csUser} onChange={update('csUser')}
                placeholder="operator"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-500 transition-colors" />
            </Field>
            <Field label="Password">
              <input value={config.csPass} onChange={update('csPass')}
                type="password" placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-500 transition-colors" />
            </Field>
            <Field label="CS Directory" className="col-span-2">
              <input value={config.csDir} onChange={update('csDir')}
                placeholder="/opt/cobaltstrike"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-500 transition-colors" />
            </Field>
            <Field label="Work Directory" className="col-span-2">
              <input value={config.workdir} onChange={update('workdir')}
                placeholder="~/sandworm/"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-500 transition-colors" />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Review & Launch ──────────────────────────────────────────────────
function StepReview({
  name, operator, range, profile, activeTactics, framework, c2Config,
}: {
  name: string; operator: string; range: string;
  profile: JQRProfile; activeTactics: string[];
  framework: C2Framework; c2Config: typeof DEFAULT_C2_CONFIG;
}) {
  const badge = C2_BADGE[framework];
  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 mb-1">Ready to launch</h2>
        <p className="text-sm text-zinc-500">
          Review your campaign configuration. You can change any of these settings inside the builder.
        </p>
      </div>

      <div className="space-y-3">
        <ReviewSection title="Campaign">
          <ReviewRow label="Name"        value={name || '—'} />
          <ReviewRow label="Operator"    value={operator || '—'} />
          <ReviewRow label="Range"       value={range || '—'} />
        </ReviewSection>

        <ReviewSection title="JQR Profile">
          <ReviewRow label="Profile"    value={profile.name} />
          <ReviewRow label="Required"   value={`${activeTactics.length} tactics`} />
          <div className="flex flex-wrap gap-1 pt-1">
            {activeTactics.map(t => {
              const tactic = MITRE_TACTICS.find(m => m.id === t);
              return (
                <span key={t} className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded font-mono">
                  {t} {tactic?.icon}
                </span>
              );
            })}
            {activeTactics.length === 0 && (
              <span className="text-[10px] text-zinc-600">No JQR tracking — canvas will be unrestricted</span>
            )}
          </div>
        </ReviewSection>

        <ReviewSection title="C2 Framework">
          <ReviewRow
            label="Framework"
            value={
              <span className="flex items-center gap-1.5">
                {framework.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                {badge && (
                  <span className="text-[8px] px-1 rounded font-bold"
                    style={{ color: badge.hex, background: badge.hex + '22' }}>
                    {badge.abbr}
                  </span>
                )}
              </span>
            }
          />
          {framework === 'cobalt_strike' && (
            <ReviewRow label="Teamserver" value={<span className="font-mono">{c2Config.csIp}:{c2Config.csPort}</span>} />
          )}
        </ReviewSection>
      </div>
    </div>
  );
}

// ── Shared field components ──────────────────────────────────────────────────
function Field({ label, required, children, className }: {
  label: string; required?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
        {label}{required && <span className="text-[#e05c00] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2">
      <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">{title}</p>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="text-[11px] text-zinc-200">{value}</span>
    </div>
  );
}

// ── Main wizard ──────────────────────────────────────────────────────────────
export default function NewCampaign() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const [name,     setName]     = useState('');
  const [operator, setOperator] = useState('');
  const [range,    setRange]    = useState('');

  const [selectedProfile, setSelectedProfile] = useState<JQRProfile>(JQR_PRESETS[0]);
  const [customTactics,   setCustomTactics]   = useState<string[]>([]);

  const [framework, setFramework] = useState<C2Framework>('cobalt_strike');
  const [c2Config,  setC2Config]  = useState({ ...DEFAULT_C2_CONFIG });

  const activeTactics = selectedProfile.id === 'custom'
    ? customTactics
    : selectedProfile.requiredTactics;

  const canAdvance = step === 1 ? name.trim().length > 0 : true;

  const handleLaunch = () => {
    const id = generateCampaignId();
    const now = new Date().toISOString();

    const campaign: CampaignConfig = {
      id,
      name:            name.trim() || 'Untitled Campaign',
      operatorName:    operator.trim(),
      rangeEnvironment: range.trim(),
      createdAt:       now,
      updatedAt:       now,
      jqrProfileId:    selectedProfile.id,
      jqrProfile:      { ...selectedProfile, requiredTactics: activeTactics },
      c2Framework:     framework,
      c2Config,
      nodeCount:       0,
      tacticsCovered:  [],
      jqrProgress:     0,
    };

    saveCampaignToIndex(campaign);
    navigate(`/campaign/${id}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&family=Share+Tech+Mono&display=swap');
        .lumen-wiz-header {
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
        .lumen-wiz-header::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, #ffffff08 1px, transparent 1px),
            linear-gradient(to bottom, #ffffff08 1px, transparent 1px);
          background-size: 24px 24px;
          pointer-events: none;
        }
        .lumen-wiz-header::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(to right, transparent, #f59e0b55, transparent);
        }
        .wiz-wordmark {
          display: flex; flex-direction: column; line-height: 1;
          position: absolute; left: 50%; transform: translateX(-50%);
          z-index: 1;
        }
        .wiz-wordmark-primary { display: flex; align-items: center; }
        .wiz-wordmark-text {
          font-family: "Rajdhani", sans-serif; font-weight: 500; font-size: 26px;
          letter-spacing: 0.28em; color: #ffffff; text-transform: uppercase; line-height: 1;
        }
        .wiz-wordmark-rays {
          display: block; flex-shrink: 0; overflow: visible; margin-top: 4px;
        }
        .wiz-wordmark-sub { display: flex; align-items: center; gap: 6px; margin-top: 5px; }
        .wiz-sub-label {
          font-family: 'Share Tech Mono', monospace; font-size: 9px; color: #f59e0b;
          letter-spacing: 0.22em; text-transform: uppercase;
        }
        .wiz-sub-tick { width: 1px; height: 8px; background: #3f3f46; flex-shrink: 0; }
        .wiz-sub-version {
          font-family: 'Share Tech Mono', monospace; font-size: 9px; color: #52525b;
          letter-spacing: 0.12em; text-transform: uppercase;
        }
        .wiz-back-btn {
          font-family: 'Share Tech Mono', monospace; font-size: 10px;
          letter-spacing: 0.1em; text-transform: uppercase;
          display: flex; align-items: center; gap: 6px;
          color: #52525b; transition: color 0.2s;
          position: relative; z-index: 1;
        }
        .wiz-back-btn:hover { color: #a1a1aa; }
      `}</style>

      {/* ── Top bar ── */}
      <header className="lumen-wiz-header">

        {/* Back */}
        <button onClick={() => navigate('/')} className="wiz-back-btn">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </button>

        {/* Wordmark — centered */}
        <div className="wiz-wordmark">
          <div className="wiz-wordmark-primary">
            <span className="wiz-wordmark-text">LUMEN</span>

            {/*
              Inline SVG rays — identical to OperatorHeader and Dashboard.
              viewBox 0 0 24 18, origin (0,13).
              Ray 1: (10,2)  1px    0.62 opacity
              Ray 2: (14,7)  1.5px  0.82 opacity
              Ray 3: (16,13) 2.5px  1.0  horizontal
            */}
            <svg
              className="wiz-wordmark-rays"
              width="24"
              height="18"
              viewBox="0 0 24 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="0" cy="13" r="1.2" fill="#f59e0b" opacity="0.7" />

              <line
                x1="0"  y1="13"
                x2="10" y2="2"
                stroke="#f59e0b"
                strokeWidth="1"
                strokeLinecap="round"
                opacity="0.62"
              />

              <line
                x1="0"  y1="13"
                x2="14" y2="7"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.82"
              />

              <line
                x1="0"  y1="13"
                x2="16" y2="13"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="wiz-wordmark-sub">
            <span className="wiz-sub-label">New Campaign</span>
            <div className="wiz-sub-tick" />
            <span className="wiz-sub-version">V1.0.0</span>
          </div>
        </div>

        {/* Balance spacer */}
        <div style={{ width: '100px' }} />
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          <div className="flex justify-center mb-12">
            <StepIndicator current={step} />
          </div>

          <div className="min-h-[420px]">
            {step === 1 && (
              <StepIdentity
                name={name} setName={setName}
                operator={operator} setOperator={setOperator}
                range={range} setRange={setRange}
              />
            )}
            {step === 2 && (
              <StepJQR
                selectedProfile={selectedProfile}
                setSelectedProfile={setSelectedProfile}
                customTactics={customTactics}
                setCustomTactics={setCustomTactics}
              />
            )}
            {step === 3 && (
              <StepC2
                framework={framework} setFramework={setFramework}
                config={c2Config}    setConfig={setC2Config}
              />
            )}
            {step === 4 && (
              <StepReview
                name={name} operator={operator} range={range}
                profile={selectedProfile} activeTactics={activeTactics}
                framework={framework} c2Config={c2Config}
              />
            )}
          </div>

          <div className="flex items-center justify-between mt-10 pt-6 border-t border-zinc-800">
            <button
              onClick={() => step > 1 ? setStep(s => s - 1) : navigate('/')}
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            <div className="flex items-center gap-1">
              {STEPS.map(s => (
                <div key={s.id} className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  s.id === step ? 'bg-[#e05c00]' : s.id < step ? 'bg-zinc-500' : 'bg-zinc-800'
                )} />
              ))}
            </div>

            {step < 4 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all',
                  canAdvance
                    ? 'bg-[#e05c00] hover:bg-[#c75200] text-white'
                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                )}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleLaunch}
                className="flex items-center gap-2 px-6 py-2 bg-[#e05c00] hover:bg-[#c75200] text-white rounded-lg text-sm font-bold transition-colors"
              >
                <Zap className="h-4 w-4" /> Launch Campaign
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}