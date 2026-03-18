// src/lib/campaignStorage.ts
// localStorage index for campaign metadata + .lumen JSON file export/import
// No backend required — campaigns are portable via .lumen files

import { CampaignConfig } from '@/types/campaign';

const STORAGE_KEY = 'lumen_campaigns';

// ── Index operations (localStorage) ─────────────────────────────────────────

export function getCampaignIndex(): CampaignConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCampaignToIndex(campaign: CampaignConfig): void {
  const index = getCampaignIndex();
  const existing = index.findIndex(c => c.id === campaign.id);
  if (existing >= 0) {
    index[existing] = { ...campaign, updatedAt: new Date().toISOString() };
  } else {
    index.unshift(campaign); // newest first
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(index));
}

export function deleteCampaignFromIndex(id: string): void {
  const index = getCampaignIndex().filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(index));
}

export function getCampaignById(id: string): CampaignConfig | null {
  return getCampaignIndex().find(c => c.id === id) ?? null;
}

// ── .lumen file export ───────────────────────────────────────────────────────

export function exportCampaignFile(campaign: CampaignConfig): void {
  const json = JSON.stringify(campaign, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${slugify(campaign.name)}_${campaign.id.slice(0, 6)}.lumen`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── .lumen file import ───────────────────────────────────────────────────────

export function importCampaignFile(): Promise<CampaignConfig> {
  return new Promise((resolve, reject) => {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.lumen,.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const campaign = JSON.parse(ev.target?.result as string) as CampaignConfig;
          // Validate minimal shape
          if (!campaign.id || !campaign.name) throw new Error('Invalid .lumen file');
          // Update timestamp on import
          campaign.updatedAt = new Date().toISOString();
          saveCampaignToIndex(campaign);
          resolve(campaign);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

// ── ID generation ────────────────────────────────────────────────────────────

export function generateCampaignId(): string {
  return `campaign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}