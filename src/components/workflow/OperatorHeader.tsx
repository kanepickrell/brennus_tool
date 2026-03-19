// src/components/workflow/OperatorHeader.tsx
import { useNavigate } from 'react-router-dom';
import { InfrastructureState } from './CollapsiblePropertiesPanel';
import { OpforGlobalSettings } from '@/types/opfor';

interface OperatorHeaderProps {
  infrastructureStatus: InfrastructureState;
  globalSettings: OpforGlobalSettings;
}

export const OperatorHeader = ({
  infrastructureStatus,
  globalSettings,
}: OperatorHeaderProps) => {
  const navigate = useNavigate();

  const avatarLabel =
    globalSettings.operator && globalSettings.operator.trim().length >= 2
      ? globalSettings.operator.trim().substring(0, 2).toUpperCase()
      : 'PX';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&family=Share+Tech+Mono&display=swap');

        .pnx-header {
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

        .pnx-header::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, #ffffff08 1px, transparent 1px),
            linear-gradient(to bottom, #ffffff08 1px, transparent 1px);
          background-size: 24px 24px;
          pointer-events: none;
        }

        .pnx-header::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(to right, transparent, #f59e0b55, transparent);
        }

        /* ── Dashboard back link ── */
        .pnx-back {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          color: #3f3f46;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          text-decoration: none;
          transition: color 0.2s;
          position: relative;
          z-index: 1;
          flex-shrink: 0;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
        }

        .pnx-back:hover {
          color: #71717a;
        }

        .pnx-back-arrow {
          font-size: 11px;
          line-height: 1;
        }

        /* ── Left cluster ── */
        .pnx-left {
          display: flex;
          align-items: center;
          gap: 16px;
          position: relative;
          z-index: 1;
        }

        .pnx-left-divider {
          width: 1px;
          height: 28px;
          background: #27272a;
          flex-shrink: 0;
        }

        /* ── Wordmark ── */
        .pnx-wordmark {
          display: flex;
          flex-direction: column;
          line-height: 1;
        }

        .pnx-wordmark-primary {
          display: flex;
          align-items: center;
        }

        .pnx-wordmark-text {
          font-family: "Rajdhani", sans-serif;
          font-weight: 500;
          font-size: 26px;
          letter-spacing: 0.28em;
          color: #ffffff;
          text-transform: uppercase;
          line-height: 1;
        }

        /* ── Inline SVG ray mark ── */
        .pnx-wordmark-rays {
          display: block;
          flex-shrink: 0;
          overflow: visible;
          margin-top: 2px;
        }

        .pnx-wordmark-sub {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 5px;
        }

        .pnx-sub-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          color: #f59e0b;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        .pnx-sub-tick {
          width: 1px;
          height: 8px;
          background: #3f3f46;
          flex-shrink: 0;
        }

        .pnx-sub-version {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          color: #52525b;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        /* ── Network info ── */
        .pnx-divider {
          width: 1px;
          height: 36px;
          background: #27272a;
          margin: 0 20px;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }

        .pnx-network {
          display: flex;
          flex-direction: column;
          gap: 2px;
          position: relative;
          z-index: 1;
        }

        .pnx-field-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 8px;
          color: #52525b;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .pnx-field-value {
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          color: #a1a1aa;
          letter-spacing: 0.04em;
        }

        /* ── Right cluster ── */
        .pnx-right {
          display: flex;
          align-items: center;
          gap: 24px;
          position: relative;
          z-index: 1;
        }

        .pnx-status-row {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .pnx-dot-group {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
        }

        .pnx-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .pnx-dot-on  { background: #22c55e; box-shadow: 0 0 6px #22c55e66; }
        .pnx-dot-off { background: #3f3f46; }
        .pnx-dot-label-on  { color: #4ade80; }
        .pnx-dot-label-off { color: #52525b; }

        .pnx-session {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .pnx-session-value {
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
          color: #f59e0b80;
          letter-spacing: 0.2em;
        }

        .pnx-sys-badge {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 2px;
          padding: 6px 8px 6px 14px;
          position: relative;
        }

        .pnx-sys-badge::before {
          content: '';
          position: absolute;
          left: 0; top: 20%; bottom: 20%;
          width: 2px;
          background: #22c55e;
          border-radius: 0 1px 1px 0;
        }

        .pnx-sys-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .pnx-sys-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 8px;
          color: #52525b;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .pnx-sys-value {
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          color: #4ade80;
          display: flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 0.06em;
        }

        .pnx-pulse {
          position: relative;
          width: 8px;
          height: 8px;
          flex-shrink: 0;
        }

        .pnx-pulse::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: #22c55e;
          opacity: 0.55;
          animation: pnx-pulse 1.5s ease-out infinite;
        }

        .pnx-pulse::after {
          content: '';
          position: absolute;
          inset: 1px;
          border-radius: 50%;
          background: #22c55e;
        }

        @keyframes pnx-pulse {
          0%   { transform: scale(1);   opacity: 0.55; }
          100% { transform: scale(2.4); opacity: 0; }
        }

        .pnx-avatar-wrap {
          width: 36px;
          height: 36px;
          border-radius: 2px;
          border: 1px solid #22c55e30;
          background: #09090b;
          display: flex;
          align-items: center;
          justify-content: center;
          transform: rotate(45deg);
          flex-shrink: 0;
          transition: border-color 0.2s;
        }

        .pnx-avatar-wrap:hover { border-color: #22c55e60; }

        .pnx-avatar-inner {
          transform: rotate(-45deg);
          font-family: 'Rajdhani', sans-serif;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.05em;
          color: #52525b;
          text-transform: uppercase;
          user-select: none;
          line-height: 1;
          transition: color 0.2s;
        }

        .pnx-avatar-named .pnx-avatar-wrap  { border-color: #f59e0b40; }
        .pnx-avatar-named .pnx-avatar-inner { color: #a16207; }
      `}</style>

      <header className="pnx-header">

        {/* ── LEFT: Back + Wordmark + Network ── */}
        <div className="pnx-left">

          {/* Dashboard back link */}
          <button className="pnx-back" onClick={() => navigate('/')}>
            <span className="pnx-back-arrow">←</span>
            <span>Dashboard</span>
          </button>

          <div className="pnx-left-divider" />

          {/* Wordmark */}
          <div className="pnx-wordmark">
            <div className="pnx-wordmark-primary">

              {/* LUMEN text — unchanged */}
              <span className="pnx-wordmark-text">LUMEN</span>

              {/*
                Ray SVG — tightened proportions, no animation.

                viewBox: 0 0 24 18
                  Origin (0, 13) = bottom-right of the N stroke.
                  All three rays are shorter than before.

                Ray 1 — steep accent:   (10, 2)   thinnest, dimmest
                Ray 2 — mid accent:     (14, 7)   medium
                Ray 3 — shell cursor:   (20, 13)  thick, horizontal, static
              */}
              <svg
                className="pnx-wordmark-rays"
                width="24"
                height="18"
                viewBox="0 0 24 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                {/* Anchor dot */}
                <circle cx="0" cy="13" r="1.2" fill="#f59e0b" opacity="0.7" />

                {/* Ray 1 — steep, short, dimmest */}
                <line
                  x1="0"  y1="13"
                  x2="10" y2="2"
                  stroke="#f59e0b"
                  strokeWidth="1"
                  strokeLinecap="round"
                  opacity="0.62"
                />

                {/* Ray 2 — mid angle */}
                <line
                  x1="0"  y1="13"
                  x2="14" y2="7"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.82"
                />

                {/* Ray 3 — shell underscore, flat, static */}
                <line
                  x1="0"  y1="13"
                  x2="20" y2="13"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>

            </div>
            <div className="pnx-wordmark-sub">
              <span className="pnx-sub-label">Campaign Studio</span>
              <div className="pnx-sub-tick" />
              <span className="pnx-sub-version">V1.0.0</span>
            </div>
          </div>

          <div className="pnx-divider" />

          {/* Network label */}
          <div className="pnx-network">
            <span className="pnx-field-label">Network</span>
            <span className="pnx-field-value">
              {globalSettings.targetNetwork || 'Simspace Development Range'}
            </span>
          </div>
        </div>

        {/* ── RIGHT: Status + Session + System State ── */}
        <div className="pnx-right">

          <div className="pnx-status-row">
            <div className="pnx-dot-group">
              <div className={`pnx-dot ${infrastructureStatus.c2Connected ? 'pnx-dot-on' : 'pnx-dot-off'}`} />
              <span className={infrastructureStatus.c2Connected ? 'pnx-dot-label-on' : 'pnx-dot-label-off'}>
                C2
              </span>
            </div>
            <div className="pnx-dot-group">
              <div className={`pnx-dot ${infrastructureStatus.robotAvailable ? 'pnx-dot-on' : 'pnx-dot-off'}`} />
              <span className={infrastructureStatus.robotAvailable ? 'pnx-dot-label-on' : 'pnx-dot-label-off'}>
                Robot
              </span>
            </div>
          </div>

          <div className="pnx-session">
            <span className="pnx-field-label">Active Session</span>
            <span className="pnx-session-value">{globalSettings.sessionId}</span>
          </div>

          <div className="pnx-sys-badge">
            <div className="pnx-sys-info">
              <span className="pnx-sys-label">System State</span>
              <span className="pnx-sys-value">
                <div className="pnx-pulse" />
                READY
              </span>
            </div>

            <div className={globalSettings.operator?.trim() ? 'pnx-avatar-named' : ''}>
              <div className="pnx-avatar-wrap">
                <span className="pnx-avatar-inner">{avatarLabel}</span>
              </div>
            </div>
          </div>

        </div>
      </header>
    </>
  );
};