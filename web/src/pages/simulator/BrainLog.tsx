import type { TraceEntry, TraceKind } from '@bhavya/shared';
import type { CSSProperties } from 'react';

const KINDS: Record<TraceKind, { label: string; color: string }> = {
  sensor: { label: 'Sensor', color: '#2f5aa8' },
  privacy: { label: 'Privacy', color: '#5b4bc4' },
  home: { label: 'Home', color: '#9a5b00' },
  engine: { label: 'Engine', color: '#2f6f73' },
  muse: { label: 'Muse', color: '#b0347a' },
  child: { label: 'Child', color: '#2b7a3d' },
  parent: { label: 'Parent', color: '#c2410c' },
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

/** What the hub noticed and decided, newest first. */
export function BrainLog({ traces, onClose }: { traces: TraceEntry[]; onClose: () => void }) {
  return (
    <section className="sim3d-log" aria-label="Bhavya's brain">
      <header className="sim3d-log-head">
        <b>🧠 Bhavya&apos;s brain</b>
        <span className="small muted">
          Sensors report, Muse advises, the engine decides. Newest first.
        </span>
        <button type="button" className="sim3d-close" onClick={onClose} aria-label="Close the log">
          ✕
        </button>
      </header>
      {traces.length === 0 ? (
        <p className="muted sim3d-log-empty">Nothing yet. Walk the child into a room.</p>
      ) : (
        <ol>
          {traces.map((entry) => {
            const kind = KINDS[entry.kind];
            return (
              <li key={entry.id} style={{ '--c': kind.color } as CSSProperties}>
                <time dateTime={entry.at}>{time(entry.at)}</time>
                <span className="who">{kind.label}</span>
                <span>{entry.message}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
