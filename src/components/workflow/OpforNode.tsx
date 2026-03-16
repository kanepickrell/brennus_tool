// src/components/workflow/OpforNode.tsx
// Canvas node card - shows node name and key parameter values

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { OpforNodeData, MitreTactic, NodeValidationState } from '@/types/opfor';
import { cn } from '@/lib/utils';

const tacticStyles: Record<MitreTactic, { bg: string; border: string; icon: string; glow: string }> = {
  'TA0043': { bg: 'bg-[hsl(280,60%,10%)]/90', border: 'border-[hsl(280,60%,50%)]/50', icon: 'text-[hsl(280,60%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]' },
  'TA0042': { bg: 'bg-[hsl(190,60%,10%)]/90', border: 'border-[hsl(190,60%,50%)]/50', icon: 'text-[hsl(190,60%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(34,211,238,0.3)]' },
  'TA0001': { bg: 'bg-[hsl(210,100%,10%)]/90', border: 'border-[hsl(210,100%,50%)]/50', icon: 'text-[hsl(210,100%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(0,149,255,0.3)]' },
  'TA0002': { bg: 'bg-[hsl(25,95%,10%)]/90', border: 'border-[hsl(25,95%,50%)]/50', icon: 'text-[hsl(25,95%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(255,145,0,0.3)]' },
  'TA0003': { bg: 'bg-[hsl(270,60%,10%)]/90', border: 'border-[hsl(270,60%,50%)]/50', icon: 'text-[hsl(270,60%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]' },
  'TA0004': { bg: 'bg-[hsl(310,60%,10%)]/90', border: 'border-[hsl(310,60%,50%)]/50', icon: 'text-[hsl(310,60%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(236,72,153,0.3)]' },
  'TA0005': { bg: 'bg-[hsl(240,60%,10%)]/90', border: 'border-[hsl(240,60%,50%)]/50', icon: 'text-[hsl(240,60%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(99,102,241,0.3)]' },
  'TA0006': { bg: 'bg-[hsl(0,80%,10%)]/90', border: 'border-[hsl(0,80%,50%)]/50', icon: 'text-[hsl(0,80%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(255,0,0,0.3)]' },
  'TA0007': { bg: 'bg-[hsl(142,76%,10%)]/90', border: 'border-[hsl(142,76%,40%)]/50', icon: 'text-[hsl(142,76%,50%)]', glow: 'hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]' },
  'TA0008': { bg: 'bg-[hsl(270,60%,10%)]/90', border: 'border-[hsl(270,60%,50%)]/50', icon: 'text-[hsl(270,60%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]' },
  'TA0009': { bg: 'bg-[hsl(180,60%,10%)]/90', border: 'border-[hsl(180,60%,50%)]/50', icon: 'text-[hsl(180,60%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(34,211,238,0.3)]' },
  'TA0010': { bg: 'bg-[hsl(160,60%,10%)]/90', border: 'border-[hsl(160,60%,50%)]/50', icon: 'text-[hsl(160,60%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(20,184,166,0.3)]' },
  'TA0011': { bg: 'bg-[hsl(45,100%,10%)]/90', border: 'border-[hsl(45,100%,50%)]/50', icon: 'text-[hsl(45,100%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(234,179,8,0.3)]' },
  'TA0040': { bg: 'bg-[hsl(0,100%,10%)]/90', border: 'border-[hsl(0,100%,50%)]/50', icon: 'text-[hsl(0,100%,60%)]', glow: 'hover:shadow-[0_0_15px_rgba(255,0,0,0.3)]' },
  'control': { bg: 'bg-zinc-900/90', border: 'border-zinc-700', icon: 'text-zinc-400', glow: 'hover:shadow-none' },
};

// Validation state styles
const validationStateStyles: Record<NodeValidationState, { border: string; badge: string; badgeText: string; glowClass?: string }> = {
  'unconfigured': { 
    border: 'border-zinc-700', 
    badge: 'bg-zinc-800/50 text-zinc-500',
    badgeText: '○ UNCONFIGURED',
  },
  'configured': { 
    border: 'border-yellow-500/50', 
    badge: 'bg-yellow-500/20 text-yellow-400',
    badgeText: '⚠ CONFIGURE',
  },
  'validated': { 
    border: 'border-green-500/70', 
    badge: 'bg-green-500/20 text-green-400',
    badgeText: '✓ VALIDATED',
    glowClass: 'shadow-[0_0_20px_rgba(34,197,94,0.4)]',
  },
  'executing': { 
    border: 'border-purple-500', 
    badge: 'bg-purple-500/20 text-purple-400',
    badgeText: '⟲ RUNNING',
  },
  'success': { 
    border: 'border-green-500', 
    badge: 'bg-green-500/20 text-green-400',
    badgeText: '✓ SUCCESS',
  },
  'failed': { 
    border: 'border-red-500', 
    badge: 'bg-red-500/20 text-red-400',
    badgeText: '✗ FAILED',
  },
};

// Helper function to format duration
function formatDuration(duration: string | number | undefined): string {
  if (!duration) return 'N/A';
  
  if (typeof duration === 'string') {
    return duration;
  }
  
  if (typeof duration === 'number') {
    if (duration < 60) {
      return `${duration}s`;
    }
    return `${Math.round(duration / 60)}m`;
  }
  
  return 'N/A';
}

/**
 * Get the primary display value for the node - shows the most important configured parameter
 * Returns null if no meaningful value to display
 */
function getPrimaryDisplayValue(data: OpforNodeData): string | null {
  const { parameters } = data;
  if (!parameters) return null;
  
  // Priority order of parameters to display
  const displayParams = [
    'listenerName',  // Create Listener
    'payloadName',   // Create Payload
    'name',          // Generic name field
    'csIp',          // Start C2
    'targetIp',      // Target-related
    'command',       // Shell commands
  ];
  
  for (const paramId of displayParams) {
    const value = parameters[paramId];
    if (value !== undefined && value !== null && value !== '') {
      const strValue = String(value);
      // Don't show variable references like ${LISTENER_NAME}
      if (!strValue.startsWith('${')) {
        // Truncate long values
        return strValue.length > 20 ? strValue.substring(0, 18) + '...' : strValue;
      }
    }
  }
  
  return null;
}

export const OpforNode = memo(({ data, selected }: { data: OpforNodeData; selected?: boolean }) => {
  const { definition } = data;
  const styles = tacticStyles[definition?.tactic] || tacticStyles['control'];
  const validationState = data.validationState || 'unconfigured';
  const validationStyles = validationStateStyles[validationState];

  // Safe arrays with fallbacks
  const inputs = definition?.inputs || [];
  const outputs = definition?.outputs || [];

  // Get primary display value (e.g., listener name, payload name)
  const primaryValue = getPrimaryDisplayValue(data);

  return (
    <div className={cn(
      'w-[160px] rounded-lg border-2 backdrop-blur-md transition-all duration-200',
      styles.bg, 
      validationStyles.border,
      styles.glow,
      validationStyles.glowClass,
      selected && 'ring-2 ring-primary ring-offset-2 ring-offset-black scale-[1.02]',
      validationState === 'executing' && 'shadow-lg shadow-purple-500/20'
    )}>
      {/* Input Handles */}
      {inputs.map((input, i) => (
        <Handle 
          key={input.id} 
          type="target" 
          position={Position.Left} 
          id={input.id} 
          className={cn(
            "w-3 h-3 border-2 border-background transition-colors",
            validationState === 'success' ? 'bg-green-500' : 
            validationState === 'failed' ? 'bg-red-500' :
            validationState === 'executing' ? 'bg-purple-500' :
            validationState === 'validated' ? 'bg-green-500' :
            'bg-primary'
          )}
          style={{ top: `${((i + 1) / (inputs.length + 1)) * 100}%` }} 
        />
      ))}
      
      {/* Header */}
      <div className="px-2.5 py-1.5 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <span className={cn('text-base flex-shrink-0', styles.icon)}>{definition?.icon || '⚡'}</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold text-white truncate leading-tight">
              {definition?.name || 'Unnamed'}
            </h3>
            {/* Show primary value if available (like listener name) */}
            {primaryValue ? (
              <p className="text-[9px] text-cyan-400 font-mono truncate leading-tight">
                {primaryValue}
              </p>
            ) : (
              <p className="text-[8px] text-zinc-500 uppercase tracking-tighter leading-tight">
                {definition?.tactic || 'control'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-2.5 py-1.5 space-y-1.5">
        {/* Validation State Badge */}
        <div className={cn(
          'text-[8px] px-1.5 py-0.5 rounded-sm font-bold uppercase inline-block',
          validationStyles.badge
        )}>
          {validationStyles.badgeText}
        </div>

        {/* Risk Level & Duration Row */}
        <div className="flex items-center justify-between text-[9px]">
          <span className={cn(
            'px-1.5 py-0.5 rounded-sm font-bold uppercase',
            definition?.riskLevel === 'critical' ? 'bg-red-500/20 text-red-500' :
            definition?.riskLevel === 'high' ? 'bg-orange-500/20 text-orange-500' :
            definition?.riskLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-500' :
            'bg-green-500/20 text-green-500'
          )}>
            {definition?.riskLevel || 'medium'}
          </span>
          <span className="text-zinc-400">
            {formatDuration(definition?.estimatedDuration)}
          </span>
        </div>
      </div>

      {/* Output Handles */}
      {outputs.map((output, i) => (
        <Handle 
          key={output.id} 
          type="source" 
          position={Position.Right} 
          id={output.id} 
          className={cn(
            "w-3 h-3 border-2 border-background transition-colors",
            validationState === 'success' ? 'bg-green-500' : 
            validationState === 'failed' ? 'bg-red-500' :
            validationState === 'executing' ? 'bg-purple-500' :
            validationState === 'validated' ? 'bg-green-500' :
            'bg-primary'
          )}
          style={{ top: `${((i + 1) / (outputs.length + 1)) * 100}%` }} 
        />
      ))}
    </div>
  );
});

OpforNode.displayName = 'OpforNode';