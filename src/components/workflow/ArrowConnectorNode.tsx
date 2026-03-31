// src/components/workflow/ArrowConnectorNode.tsx
// Tiny decorative node placed between swim lane groups.
// Shows a downward arrow glyph to indicate sequence flow.
// No handles, not selectable, not draggable.

import { memo } from 'react';

export const ArrowConnectorNode = memo(() => (
  <div
    style={{
      width: 20,
      height: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}
  >
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1v9M3.5 7l3.5 4 3.5-4"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
));

ArrowConnectorNode.displayName = 'ArrowConnectorNode';