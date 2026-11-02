import type { ChildProfile, Zone } from '@bhavya/shared';
import { useEffect, useState } from 'react';
import { Button, Card, ErrorNotice, Field, Notice, PageHeader, Spinner } from '../../components/ui';
import { api, ApiError, errorMessage } from '../../lib/api';
import { LEVEL_LABELS, slugify } from '../../lib/format';
import { speaker } from '../../lib/speech';
import { useLoader } from '../../lib/useLoader';

interface Status {
  tone: 'success' | 'danger';
  message: string;
  details?: string[];
}

export function SettingsPage() {
  const settings = useLoader(() => api.settings(), []);
  const options = useLoader(() => api.options(), []);
  if (settings.error) return <ErrorNotice error={settings.error} />;
  if (!settings.data) return <Spinner label="Loading settings…" />;
  return (
    <>
      <PageHeader
        title="Child & rooms"
        subtitle="How Bhavya talks to your child, and which rooms are private."
      />
      <div className="stack">
        <ProfileCard
          initial={settings.data.profile}
          suggestionsAvailable={options.data?.glassesSuggestions ?? false}
          privatePauseMinutes={options.data?.privatePauseMinutes ?? 10}
          calmAvailable={options.data?.calmSupport ?? false}
        />
        <RoomsCard initial={settings.data.zones} />
        <BoardCard />
      </div>
    </>
  );
}

function StatusNote({ status }: { status: Status | null }) {
  if (!status) return null;
  return status.tone === 'success' ? (
    <Notice tone="success">{status.message}</Notice>
  ) : (
    <ErrorNotice error={status.message} details={status.details} />
  );
}

function toStatus(e: unknown): Status {
  return {
    tone: 'danger',
    message: errorMessage(e),
    details: e instanceof ApiError ? e.details : undefined,
  };
}

function ProfileCard({
  initial,
  suggestionsAvailable,
  privatePauseMinutes,
  calmAvailable,
}: {
  initial: ChildProfile;
  /** False when the hub's GLASSES_SUGGESTIONS option is off. */
  suggestionsAvailable: boolean;
  /** The hub's PRIVATE_PAUSE_MINUTES option. */
  privatePauseMinutes: number;
  /** False when the hub's CALM_SUPPORT option is off. */
  calmAvailable: boolean;
}) {
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const set = (patch: Partial<ChildProfile>) => setProfile((p) => ({ ...p, ...patch }));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      setProfile(await api.saveProfile(profile));
      setStatus({ tone: 'success', message: 'Saved. New routines use these settings.' });
    } catch (e) {
      setStatus(toStatus(e));
    } finally {
      setSaving(false);
    }
  };

  const testVoice = () => {
    speaker.unlock();
    speaker.speak(`Hello ${profile.name}. Let's wash our hands.`, {
      rate: profile.speechRate,
      volume: profile.volume,
      language: profile.language,
    });
  };

  return (
    <Card className="stack">
      <h2>Your child</h2>
      <div className="grid-2">
        <Field label="Name">
          <input
            type="text"
            value={profile.name}
            maxLength={40}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label="Language for guidance" hint="Muse writes every step in this language.">
          <input
            type="text"
            value={profile.language}
            maxLength={30}
            onChange={(e) => set({ language: e.target.value })}
          />
        </Field>
        <Field label="Wording">
          <select
            value={profile.readingLevel}
            onChange={(e) =>
              set({ readingLevel: e.target.value === 'standard' ? 'standard' : 'simple' })
            }
          >
            <option value="simple">Very simple: short sentences, one action each</option>
            <option value="standard">Standard: short and clear</option>
          </select>
        </Field>
        <Field label="Support level for new routines">
          <select
            value={profile.startLevel}
            onChange={(e) => set({ startLevel: Number(e.target.value) })}
          >
            {([3, 2, 1, 0] as const).map((level) => (
              <option key={level} value={level}>
                {LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Speaking speed: ${profile.speechRate.toFixed(1)}×`}>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={profile.speechRate}
            onChange={(e) => set({ speechRate: Number(e.target.value) })}
          />
        </Field>
        <Field label={`Volume: ${Math.round(profile.volume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={profile.volume}
            onChange={(e) => set({ volume: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="row" style={{ gap: 24 }}>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={profile.showText}
            onChange={(e) => set({ showText: e.target.checked })}
          />
          Show words next to pictures
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={profile.calming.breathing}
            onChange={(e) => set({ calming: { ...profile.calming, breathing: e.target.checked } })}
          />
          Offer breathing on breaks
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={profile.calming.music}
            onChange={(e) => set({ calming: { ...profile.calming, music: e.target.checked } })}
          />
          Offer calm music on breaks
        </label>
      </div>
      {suggestionsAvailable && (
        <div className="stack" style={{ gap: 4 }}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={profile.glassesSuggestions}
              onChange={(e) => set({ glassesSuggestions: e.target.checked })}
            />
            Suggest routines from the glasses camera
          </label>
          <p className="field-hint">
            When no routine is running, the glasses take a look every 15 seconds and Muse checks
            whether a routine fits the place. Your child is always asked first. Pictures are never
            saved. It stays off in private rooms and pauses for {privatePauseMinutes}{' '}
            {privatePauseMinutes === 1 ? 'minute' : 'minutes'} after seeing a bathroom or a place to
            change.
          </p>
        </div>
      )}
      {calmAvailable && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={profile.calmSupport.enabled}
              onChange={(e) =>
                set({ calmSupport: { ...profile.calmSupport, enabled: e.target.checked } })
              }
            />
            Calm support: offer a quiet break when my child seems upset
          </label>
          {profile.calmSupport.enabled && (
            <>
              <div className="grid-2">
                <Field label="Very loud for">
                  <select
                    value={profile.calmSupport.loudSeconds}
                    onChange={(e) =>
                      set({
                        calmSupport: {
                          ...profile.calmSupport,
                          loudSeconds: Number(e.target.value),
                        },
                      })
                    }
                  >
                    {[5, 10, 15, 20, 30].map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds} seconds
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="What counts as very loud">
                  <select
                    value={profile.calmSupport.loudLevel}
                    onChange={(e) =>
                      set({
                        calmSupport: { ...profile.calmSupport, loudLevel: Number(e.target.value) },
                      })
                    }
                  >
                    <option value={60}>Sensitive (raised voices)</option>
                    <option value={75}>Normal (shouting)</option>
                    <option value={85}>Only very loud (screaming)</option>
                  </select>
                </Field>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={profile.calmSupport.watchDistress}
                  onChange={(e) =>
                    set({
                      calmSupport: { ...profile.calmSupport, watchDistress: e.target.checked },
                    })
                  }
                />
                Also let the room camera look for signs of distress (crying, covering ears)
              </label>
            </>
          )}
          <p className="field-hint">
            Needs a room device: open /room on an old phone or laptop in a room where the camera is
            allowed. Nothing is recorded, private rooms are never watched, and harmless movements
            like rocking or hand-flapping are never counted. Your child can always say &quot;Not
            now&quot;, and you get a notification.
          </p>
        </div>
      )}
      <StatusNote status={status} />
      <div className="row">
        <Button variant="primary" busy={saving} onClick={() => void save()}>
          Save
        </Button>
        <Button icon="volume" onClick={testVoice}>
          Test the voice
        </Button>
      </div>
    </Card>
  );
}

function RoomsCard({ initial }: { initial: Zone[] }) {
  const [zones, setZones] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [savedIds, setSavedIds] = useState(() => new Set(initial.map((z) => z.id)));

  const update = (index: number, patch: Partial<Zone>) =>
    setZones((list) => list.map((z, i) => (i === index ? { ...z, ...patch } : z)));

  const addRoom = () =>
    setZones((list) => {
      let n = list.length + 1;
      while (list.some((z) => z.id === `room_${n}`)) n++;
      return [...list, { id: `room_${n}`, name: `Room ${n}`, type: 'camera_ok', light: null }];
    });

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const saved = await api.saveZones(zones);
      setZones(saved);
      setSavedIds(new Set(saved.map((z) => z.id)));
      setStatus({ tone: 'success', message: 'Rooms saved.' });
    } catch (e) {
      setStatus(toStatus(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="stack">
      <h2>Rooms</h2>
      <p className="muted small">
        Private rooms never use the camera, and video teaching is not offered for them. Rooms with a
        smart light can switch it on when a routine starts.
      </p>
      <table>
        <thead>
          <tr>
            <th>Room</th>
            <th>Privacy</th>
            <th>Smart light id</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {zones.map((zone, index) => (
            <tr key={index}>
              <td>
                <input
                  type="text"
                  aria-label="Room name"
                  value={zone.name}
                  maxLength={40}
                  onChange={(e) => {
                    const name = e.target.value;
                    // New rooms get their id from the name; existing ids never change.
                    update(
                      index,
                      savedIds.has(zone.id) ? { name } : { name, id: slugify(name) || zone.id },
                    );
                  }}
                />
              </td>
              <td>
                <select
                  aria-label="Privacy"
                  value={zone.type}
                  onChange={(e) =>
                    update(index, { type: e.target.value === 'private' ? 'private' : 'camera_ok' })
                  }
                >
                  <option value="private">Private (camera off)</option>
                  <option value="camera_ok">Camera allowed</option>
                </select>
              </td>
              <td>
                <input
                  type="text"
                  aria-label="Smart light id"
                  placeholder="none"
                  value={zone.light ?? ''}
                  maxLength={40}
                  onChange={(e) => update(index, { light: e.target.value.trim() || null })}
                />
              </td>
              <td>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  aria-label={`Remove ${zone.name}`}
                  disabled={zones.length === 1}
                  onClick={() => setZones((list) => list.filter((_, i) => i !== index))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <StatusNote status={status} />
      <div className="row">
        <Button variant="primary" busy={saving} onClick={() => void save()}>
          Save rooms
        </Button>
        <Button icon="plus" onClick={addRoom} disabled={zones.length >= 12}>
          Add room
        </Button>
      </div>
    </Card>
  );
}

function BoardCard() {
  const board = useLoader(() => api.board(), []);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (board.data) setIcons(board.data.icons);
  }, [board.data]);

  const make = async (phraseIds: string[]) => {
    setStatus(null);
    for (const id of phraseIds) {
      setBusy(id);
      try {
        setIcons((await api.makeBoardIcon(id)).icons);
      } catch (e) {
        setStatus(toStatus(e));
        break;
      }
    }
    setBusy(null);
  };

  if (board.error) return <ErrorNotice error={board.error} />;
  if (!board.data) return <Spinner />;
  const missing = board.data.phrases.filter((p) => !icons[p.id]).map((p) => p.id);

  return (
    <Card className="stack">
      <h2>Communication board pictures</h2>
      <p className="muted small">
        Your child taps these to say something without speaking. Muse Image draws a simple picture
        for each one.
      </p>
      <div className="board-admin">
        {board.data.phrases.map((phrase) => (
          <figure key={phrase.id}>
            <div className="step-card-image">
              {icons[phrase.id] ? (
                <img src={icons[phrase.id]} alt={phrase.label} />
              ) : (
                <span>{phrase.label}</span>
              )}
            </div>
            <figcaption className="small">{phrase.label}</figcaption>
            <Button
              size="sm"
              busy={busy === phrase.id}
              disabled={!!busy}
              onClick={() => void make([phrase.id])}
            >
              {icons[phrase.id] ? 'Redraw' : 'Draw'}
            </Button>
          </figure>
        ))}
      </div>
      <StatusNote status={status} />
      <div className="row">
        <Button
          icon="sparkle"
          disabled={!!busy || missing.length === 0}
          onClick={() => void make(missing)}
        >
          {missing.length > 0 ? `Draw ${missing.length} missing pictures` : 'All pictures drawn'}
        </Button>
      </div>
    </Card>
  );
}
