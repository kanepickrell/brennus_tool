// src/constants/c2.ts
// Shared C2 framework designators — single source of truth for badges, filters, and script generation.
// Add new frameworks here; NodePalette and OpforNode will pick them up automatically.

export interface C2BadgeConfig {
  label: string;  // Full display name
  abbr: string;   // Short badge label shown in UI
  hex: string;    // Brand color (used for badge bg/border/text)
}

export const C2_BADGE: Record<string, C2BadgeConfig> = {
  cobalt_strike: { label: 'Cobalt Strike',              abbr: 'CS',     hex: '#e05c00' },
  sliver:        { label: 'Sliver',                     abbr: 'SL',     hex: '#7c3aed' },
  havoc:         { label: 'Havoc',                      abbr: 'HV',     hex: '#dc2626' },
  ssh:           { label: 'SSH',                        abbr: 'SSH',    hex: '#0284c7' },
  shell:         { label: 'Shell',                      abbr: 'SH',     hex: '#16a34a' },
  orchestration: { label: 'Orchestration',              abbr: 'OR',     hex: '#6b7280' },
  utility:       { label: 'Utility',                    abbr: 'UT',     hex: '#ca8a04' },
  phishing:      { label: 'Phishing',                   abbr: 'PH',     hex: '#dc2626' },
  custom:        { label: 'Custom (Operator-authored)', abbr: 'CUSTOM', hex: '#f59e0b' },
};

// Ordered list for filter UI — controls display order of C2 filter buttons
export const C2_TYPES = Object.keys(C2_BADGE) as (keyof typeof C2_BADGE)[];