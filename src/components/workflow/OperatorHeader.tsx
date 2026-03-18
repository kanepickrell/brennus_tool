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
  // Derive avatar initials: use operator first 2 chars, fallback to PX
  const avatarLabel =
    globalSettings.operator && globalSettings.operator.trim().length >= 2
      ? globalSettings.operator.trim().substring(0, 2).toUpperCase()
      : 'PX';

  return (
    <>
      {/* ── Scoped styles ── */}
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

        /* Subtle dot-grid background */
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

        /* Amber gradient line along bottom border */
        .pnx-header::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(to right, transparent, #f59e0b55, transparent);
        }

        /* ── Wordmark ── */
        .pnx-wordmark {
          display: flex;
          flex-direction: column;
          line-height: 1;
          position: relative;
          z-index: 1;
        }

        .pnx-wordmark-primary {
          display: flex;
          align-items: baseline;
        }

        .pnx-wordmark-text {
          font-family: "Rajdhani", sans-serif;
          font-weight: 500;
          font-style: normal;
          font-size: 26px;
          letter-spacing: 0.28em;
          color: #ffffff;
          text-transform: uppercase;
          line-height: 1;
          /* Tighten NN pair slightly within the wide tracking */
          text-rendering: geometricPrecision;
        }

        .pnx-wordmark-cursor {
          font-family: 'Rajdhani', sans-serif;
          font-weight: 700;
          font-size: 26px;
          color: #f59e0b;
          margin-left: 2px;
          line-height: 1;
        //   animation: pnx-blink 10.8s ease-in-out infinite;
        }

        @keyframes pnx-blink {
            0%, 100% { opacity: 1; }
            45%       { opacity: 1; }
            55%       { opacity: 0; }
            90%       { opacity: 0; }
            }

        /* Campaign Studio + version row */
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

        /* ── Left-side divider ── */
        .pnx-divider {
          width: 1px;
          height: 36px;
          background: #27272a;
          margin: 0 20px;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }

        /* ── Network info ── */
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

        /* Status dots */
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

        /* Session */
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

        /* ── System state badge ── */
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

        /* Green left-edge accent bar — ties READY color to container */
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

        /* Pulse ring around ready dot */
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

        /* ── PX Avatar (rotated diamond) ── */
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

        .pnx-avatar-wrap:hover {
          border-color: #22c55e60;
        }

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

        /* Highlight avatar when operator is set */
        .pnx-avatar-named .pnx-avatar-wrap {
          border-color: #f59e0b40;
        }

        .pnx-avatar-named .pnx-avatar-inner {
          color: #a16207;
        }
      `}</style>

      <header className="pnx-header">

        {/* ── LEFT: Wordmark + Network ── */}
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1 }}>

          {/* Wordmark */}
          <div className="pnx-wordmark">
            <div className="pnx-wordmark-primary">
              <span className="pnx-wordmark-text">LUMEN</span>
              <span className="pnx-wordmark-cursor">_</span>
            </div>
            <div className="pnx-wordmark-sub">
              <span className="pnx-sub-label">Campaign Studio</span>
              <div className="pnx-sub-tick" />
              <span className="pnx-sub-version">V1.0.0</span>
            </div>
          </div>

          {/* Vertical divider */}
          <div className="pnx-divider" />

          {/* Network label */}
          <div className="pnx-network">
            <span className="pnx-field-label">Network</span>
            <span className="pnx-field-value">Simspace Development Range</span>
          </div>
        </div>

        {/* ── RIGHT: Status + Session + System State ── */}
        <div className="pnx-right">

          {/* C2 / Robot status dots */}
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

          {/* Active session */}
          <div className="pnx-session">
            <span className="pnx-field-label">Active Session</span>
            <span className="pnx-session-value">{globalSettings.sessionId}</span>
          </div>

          {/* System state badge */}
          <div className="pnx-sys-badge">
            <div className="pnx-sys-info">
              <span className="pnx-sys-label">System State</span>
              <span className="pnx-sys-value">
                <div className="pnx-pulse" />
                READY
              </span>
            </div>

            {/* PX avatar — updates to operator initials when operator is set */}
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