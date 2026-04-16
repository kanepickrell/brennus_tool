// src/components/workflow/CustomCommandDialog.tsx
// Minimal dialog for authoring custom command modules during a session.
// Saved JSONs land in server/custom_commands/ for the dev team to promote
// into the permanent library later. No auto-publish.

import { useState } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { API_CONFIG } from '@/config/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const TACTICS = [
  { id: 'TA0042', label: 'Resource Development', icon: '🏗️' },
  { id: 'TA0043', label: 'Reconnaissance',       icon: '📡' },
  { id: 'TA0001', label: 'Initial Access',       icon: '🚪' },
  { id: 'TA0002', label: 'Execution',            icon: '⚡' },
  { id: 'TA0003', label: 'Persistence',          icon: '🔒' },
  { id: 'TA0004', label: 'Privilege Escalation', icon: '👑' },
  { id: 'TA0005', label: 'Defense Evasion',      icon: '🛡️' },
  { id: 'TA0006', label: 'Credential Access',    icon: '🔑' },
  { id: 'TA0007', label: 'Discovery',            icon: '🔍' },
  { id: 'TA0008', label: 'Lateral Movement',     icon: '🚀' },
  { id: 'TA0009', label: 'Collection',           icon: '📦' },
  { id: 'TA0011', label: 'Command & Control',    icon: '📡' },
  { id: 'control', label: 'Control Flow',        icon: '⚙️' },
];

type ParamRow = {
  id: string;
  label: string;
  type: 'string' | 'number' | 'text' | 'select';
  required: boolean;
  default: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after successful save so the palette refetches */
  onSaved: () => void;
}

export function CustomCommandDialog({ open, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // ── Identity ──
  const [name, setName]             = useState('');
  const [tactic, setTactic]         = useState('control');
  const [icon, setIcon]             = useState('⚡');
  const [description, setDescription] = useState('');
  const [riskLevel, setRiskLevel]   = useState<'low' | 'medium' | 'high' | 'critical'>('medium');

  // ── Robot keyword ──
  const [keyword, setKeyword]       = useState('');
  const [libraries, setLibraries]   = useState('cobaltstrikec2/cobaltstrike.py');

  // ── Parameters ──
  const [params, setParams]         = useState<ParamRow[]>([]);

  const addParam = () => {
    const n = params.length + 1;
    setParams([...params, {
      id: `param${n}`,
      label: `Parameter ${n}`,
      type: 'string',
      required: false,
      default: '',
    }]);
  };

  const updateParam = (idx: number, patch: Partial<ParamRow>) => {
    setParams(params.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };

  const removeParam = (idx: number) => {
    setParams(params.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setName(''); setTactic('control'); setIcon('⚡'); setDescription('');
    setRiskLevel('medium'); setKeyword(''); setLibraries('cobaltstrikec2/cobaltstrike.py');
    setParams([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (!keyword.trim()) {
      toast({ title: 'Robot keyword required', description: 'Example: Create Listener', variant: 'destructive' });
      return;
    }

    // Build the module key — slug of name, prefixed with "custom-" so the dev team
    // can grep operator-authored modules easily.
    const key = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

    // Build keywordArgs from parameters, positional in the order the operator defined them.
    const keywordArgs = params.map((p, i) => ({
      param: p.id,
      position: i + 1,
    }));

    const payload = {
      _key: key,
      name: name.trim(),
      tactic,
      icon,
      category: 'Custom',
      subcategory: '',
      description: description.trim(),
      riskLevel,
      estimatedDuration: 30,
      executionType: 'cobalt_strike' as const,
      parameters: params.map(p => ({
        id: p.id,
        label: p.label,
        type: p.type,
        required: p.required,
        default: p.default || undefined,
        placeholder: p.default || undefined,
      })),
      robotFramework: {
        libraries: libraries.split(',').map(l => l.trim()).filter(Boolean),
        keyword: keyword.trim(),
        keywordArgs,
        variables: [],
      },
    };

    setSaving(true);
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/custom-commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      toast({
        title: 'Custom command saved',
        description: `"${name}" — available in the palette under ${tactic}`,
      });
      reset();
      onSaved();
      onClose();
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-amber-400" />
            New Custom Command
          </DialogTitle>
          <DialogDescription>
            Author a command module for this session. Saved locally — dev team will review and
            promote into the main library later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── Identity ── */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Identity</p>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="cc-name" className="text-xs">Name *</Label>
                <Input
                  id="cc-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Custom Port Sweep"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc-icon" className="text-xs">Icon</Label>
                <Input
                  id="cc-icon"
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  className="text-xs w-16 text-center"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">ATT&CK Tactic *</Label>
                <Select value={tactic} onValueChange={setTactic}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TACTICS.map(t => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        {t.icon} {t.label} <span className="text-zinc-500 ml-2">{t.id}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Risk Level</Label>
                <Select value={riskLevel} onValueChange={v => setRiskLevel(v as any)}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" className="text-xs">Low</SelectItem>
                    <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                    <SelectItem value="high" className="text-xs">High</SelectItem>
                    <SelectItem value="critical" className="text-xs">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-desc" className="text-xs">Description</Label>
              <Textarea
                id="cc-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What does this command do?"
                rows={2}
                className="text-xs"
              />
            </div>
          </div>

          {/* ── Robot keyword ── */}
          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Robot Framework</p>

            <div className="space-y-1.5">
              <Label htmlFor="cc-keyword" className="text-xs">Keyword *</Label>
              <Input
                id="cc-keyword"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="e.g. Create Listener"
                className="text-xs font-mono"
              />
              <p className="text-[10px] text-zinc-600">
                The Robot Framework keyword this module calls. Must exist in the library below.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-libs" className="text-xs">Libraries (comma-separated)</Label>
              <Input
                id="cc-libs"
                value={libraries}
                onChange={e => setLibraries(e.target.value)}
                className="text-xs font-mono"
              />
              <p className="text-[10px] text-zinc-600">
                Defaults to the Cobalt Strike library. Add others like SSHLibrary if needed.
              </p>
            </div>
          </div>

          {/* ── Parameters ── */}
          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">
                Parameters <span className="text-zinc-600 normal-case">(passed positionally to the keyword)</span>
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addParam}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>

            {params.length === 0 && (
              <div className="p-3 rounded border border-dashed border-zinc-800 text-center">
                <p className="text-[10px] text-zinc-600">No parameters — keyword will be called with no args</p>
              </div>
            )}

            {params.map((p, idx) => (
              <div key={idx} className="p-2 rounded-md border border-zinc-800 bg-zinc-900/50 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-600 w-6">#{idx + 1}</span>
                  <Input
                    value={p.id}
                    onChange={e => updateParam(idx, { id: e.target.value })}
                    placeholder="param_id"
                    className="text-xs font-mono flex-1"
                  />
                  <Input
                    value={p.label}
                    onChange={e => updateParam(idx, { label: e.target.value })}
                    placeholder="Display label"
                    className="text-xs flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeParam(idx)}
                    className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 pl-8">
                  <Select
                    value={p.type}
                    onValueChange={v => updateParam(idx, { type: v as ParamRow['type'] })}
                  >
                    <SelectTrigger className="text-xs h-7 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string" className="text-xs">string</SelectItem>
                      <SelectItem value="number" className="text-xs">number</SelectItem>
                      <SelectItem value="text" className="text-xs">text</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={p.default}
                    onChange={e => updateParam(idx, { default: e.target.value })}
                    placeholder="Default value"
                    className="text-xs font-mono flex-1 h-7"
                  />
                  <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.required}
                      onChange={e => updateParam(idx, { required: e.target.checked })}
                      className="accent-amber-500"
                    />
                    required
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !keyword.trim()}
            className={cn('bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300')}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {saving ? 'Saving…' : 'Save Custom Command'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}