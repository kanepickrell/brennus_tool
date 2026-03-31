// src/components/workflow/TaggingFrameOverlay.tsx
//
// Renders the drag-to-frame rubber-band rectangle when the operator is in
// Frame mode. Sits as an absolutely-positioned overlay on top of the
// ReactFlow canvas. Converts screen coords → flow coords on mouse-up and
// calls onFrameComplete with the bounding box in flow space.

import { useRef, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';

interface Props {
  active: boolean;
  onFrameComplete: (bounds: { x: number; y: number; w: number; h: number }) => void;
  onCancel: () => void;
}

export function TaggingFrameOverlay({ active, onFrameComplete, onCancel }: Props) {
  const { screenToFlowPosition } = useReactFlow();

  const dragging   = useRef(false);
  const startPx    = useRef({ x: 0, y: 0 });
  const rectRef    = useRef<HTMLDivElement>(null);

  const updateRect = useCallback((ax: number, ay: number, bx: number, by: number) => {
    const el = rectRef.current;
    if (!el) return;
    const x = Math.min(ax, bx);
    const y = Math.min(ay, by);
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.width  = Math.abs(bx - ax) + 'px';
    el.style.height = Math.abs(by - ay) + 'px';
    el.style.display = 'block';
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!active || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    startPx.current  = { x: e.clientX, y: e.clientY };
    if (rectRef.current) rectRef.current.style.display = 'none';
  }, [active]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    updateRect(startPx.current.x, startPx.current.y, e.clientX, e.clientY);
  }, [updateRect]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (rectRef.current) rectRef.current.style.display = 'none';

    const ax = Math.min(startPx.current.x, e.clientX);
    const ay = Math.min(startPx.current.y, e.clientY);
    const bx = Math.max(startPx.current.x, e.clientX);
    const by = Math.max(startPx.current.y, e.clientY);

    // Ignore tiny drags (accidental clicks)
    if (bx - ax < 40 || by - ay < 40) { onCancel(); return; }

    const flowTL = screenToFlowPosition({ x: ax, y: ay });
    const flowBR = screenToFlowPosition({ x: bx, y: by });

    onFrameComplete({
      x: flowTL.x,
      y: flowTL.y,
      w: flowBR.x - flowTL.x,
      h: flowBR.y - flowTL.y,
    });
  }, [screenToFlowPosition, onFrameComplete, onCancel]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { dragging.current = false; onCancel(); }
  }, [onCancel]);

  if (!active) return null;

  return (
    <div
      className="absolute inset-0 z-50"
      style={{ cursor: 'crosshair' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* Rubber-band rectangle */}
      <div
        ref={rectRef}
        className="absolute pointer-events-none"
        style={{
          display: 'none',
          border: '1.5px dashed rgba(251,191,36,0.7)',   // amber dashed
          background: 'rgba(251,191,36,0.06)',
          borderRadius: 6,
        }}
      />
      {/* Hint banner */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-mono text-amber-300 bg-zinc-900/90 border border-amber-400/30 pointer-events-none"
      >
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        Drag to frame nodes — Esc to cancel
      </div>
    </div>
  );
}