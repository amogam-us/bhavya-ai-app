import type { ClientMessage, HomeState, Zone } from '@bhavya/shared';
import { useEffect, useRef } from 'react';
import { ROOM_PLANS, SLOTS, type Place, type RoomSlot } from './home3d/plan';
import { HomeWorld, type ChildInfo, type Quality, type RoomInfo } from './home3d/world';

interface Home3DViewProps {
  state: HomeState;
  zones: Zone[];
  send: (message: ClientMessage) => boolean;
  follow: boolean;
  quality: Quality;
  showHelp: boolean;
  onCloseHelp: () => void;
  /** Called when 3D cannot start, so the page can fall back to the simple view. */
  onUnavailable: (reason: string) => void;
}

const isSlot = (id: string | null): id is RoomSlot => !!id && (SLOTS as string[]).includes(id);

function roomInfos(state: HomeState, zones: Zone[]): Record<RoomSlot, RoomInfo> {
  const rooms = {} as Record<RoomSlot, RoomInfo>;
  for (const slot of SLOTS) {
    const zone = zones.find((z) => z.id === slot);
    rooms[slot] = {
      name: zone?.name ?? ROOM_PLANS[slot].defaultName,
      private: zone?.type === 'private',
      configured: !!zone,
      lightOn: zone?.light ? (state.lights[zone.light] ?? false) : null,
    };
  }
  return rooms;
}

function childInfo(state: HomeState): ChildInfo {
  const cameraOn = state.camera === 'on';
  const run = state.run;
  let bubble: string | null = null;
  if (!state.assistantEnabled) bubble = '😴 Helper is resting';
  else if (state.suggestion) bubble = `❔ ${state.suggestion.prompt}`;
  else if (run?.onBreak) bubble = '⏸ On a break';
  else if (run) {
    const help = run.helpRequested ? ' · help is coming' : '';
    bubble = `${run.step.action} · ${run.stepIndex + 1}/${run.totalSteps}${help}`;
  }
  return { cameraOn, looking: cameraOn && (!!run?.visionActive || state.scanning), bubble };
}

/** The 3D home, driven by the hub's state; walking the child sends sensor events. */
export function Home3DView(props: Home3DViewProps) {
  const { state, zones, follow, quality, showHelp, onCloseHelp } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HomeWorld | null>(null);
  // The world is created once; its callbacks read the latest props from here.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let world: HomeWorld;
    try {
      world = new HomeWorld(
        container,
        {
          onPlaceChange: (place: Place) => {
            const { zones: list, send } = latest.current;
            const zone = place === 'outside' ? undefined : list.find((z) => z.id === place);
            send(zone ? { type: 'zone_enter', zone: zone.id } : { type: 'zone_leave' });
          },
          onLampClick: (slot) => {
            const { zones: list, state: current, send } = latest.current;
            const device = list.find((z) => z.id === slot)?.light;
            if (device) send({ type: 'set_light', device, on: !(current.lights[device] ?? false) });
          },
        },
        latest.current.quality,
      );
    } catch (error) {
      latest.current.onUnavailable(error instanceof Error ? error.message : '3D could not start.');
      return;
    }
    worldRef.current = world;
    return () => {
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => worldRef.current?.setQuality(quality), [quality]);
  useEffect(() => worldRef.current?.setFollow(follow), [follow]);
  useEffect(() => {
    worldRef.current?.setRooms(roomInfos(state, zones));
    worldRef.current?.setChild(childInfo(state));
  }, [state, zones]);
  useEffect(() => {
    worldRef.current?.syncPlace(isSlot(state.zone) ? state.zone : null);
  }, [state.zone]);

  const zoneName = (id: string | null) => zones.find((z) => z.id === id)?.name;
  const run = state.run;
  const glasses = run?.visionActive
    ? 'Glasses checking the step'
    : state.scanning
      ? 'Glasses looking for routines'
      : null;

  return (
    <div className="sim3d-view">
      <div ref={containerRef} className="sim3d-canvas" />

      <div className="sim3d-hud" aria-live="polite">
        <span className="sim3d-chip">
          📍 {zoneName(state.zone) ?? 'Outside · location unknown'}
        </span>
        <span className={`sim3d-chip ${state.camera === 'on' ? 'is-on' : 'is-off'}`}>
          {state.camera === 'on' ? '📷 Camera allowed' : '🚫 Camera off'}
        </span>
        {glasses && <span className="sim3d-chip">👓 {glasses}</span>}
        {run && (
          <span className="sim3d-chip is-run">
            ▶ {run.missionTitle} · step {run.stepIndex + 1}/{run.totalSteps}
          </span>
        )}
        {state.paused && (
          <span className="sim3d-chip">⏳ Waiting: {state.paused.missionTitle}</span>
        )}
      </div>

      <div className="sim3d-rooms" role="group" aria-label="Walk the child to">
        <span className="sim3d-rooms-label">Walk to</span>
        {SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            className={`sim3d-room ${state.zone === slot ? 'is-here' : ''}`}
            onClick={() => worldRef.current?.walkTo(slot)}
          >
            {zones.find((z) => z.id === slot)?.type === 'private' && '🔒 '}
            {zoneName(slot) ?? ROOM_PLANS[slot].defaultName}
          </button>
        ))}
        <button
          type="button"
          className={`sim3d-room ${state.zone === null ? 'is-here' : ''}`}
          onClick={() => worldRef.current?.walkTo('outside')}
        >
          🌳 Outside
        </button>
      </div>

      {showHelp && (
        <div className="sim3d-help" role="note">
          <b>How to play</b>
          <ul>
            <li>
              <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> or <kbd>W</kbd> <kbd>A</kbd>{' '}
              <kbd>S</kbd> <kbd>D</kbd> to walk, hold <kbd>Shift</kbd> to run
            </li>
            <li>Click a room, or a button below, to walk there</li>
            <li>Click a lamp to switch its light</li>
            <li>Drag to turn the view, scroll to zoom</li>
            <li>Use the phone on the right as the child</li>
          </ul>
          <button type="button" className="btn btn-primary btn-sm" onClick={onCloseHelp}>
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
