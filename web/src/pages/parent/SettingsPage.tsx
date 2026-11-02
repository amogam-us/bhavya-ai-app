import type { ChildProfile, Zone } from '@bhavya/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../../components/Icon';
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

type SettingsTab = 'child' | 'rooms' | 'board';

const TABS: { id: SettingsTab; label: string; icon: IconName }[] = [
  { id: 'child', label: 'Profile', icon: 'heart' },
  { id: 'rooms', label: 'Rooms', icon: 'home' },
  { id: 'board', label: 'Board pictures', icon: 'image' },
];

export function SettingsPage() {
  const settings = useLoader(() => api.settings(), []);
  const options = useLoader(() => api.options(), []);
  const [tab, setTab] = useState<SettingsTab>('child');
  if (settings.error) return <ErrorNotice error={settings.error} />;
  if (!settings.data) return <Spinner label="Loading settings…" />;
  return (
    <>
      <PageHeader
        title="Profile & rooms"
        subtitle="Who Bhavya supports, how it talks, and which rooms are private."
      />
      <div className="page-tabs" role="tablist" aria-label="Settings">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={tab === t.id ? 'is-active' : ''}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>
      {/* Every panel stays mounted, so switching tabs keeps unsaved changes. */}
      <div role="tabpanel" id="panel-child" aria-labelledby="tab-child" hidden={tab !== 'child'}>
        <ProfileCard
          initial={settings.data.profile}
          suggestionsAvailable={options.data?.glassesSuggestions ?? false}
          privatePauseMinutes={options.data?.privatePauseMinutes ?? 10}
          calmAvailable={options.data?.calmSupport ?? false}
        />
      </div>
      <div role="tabpanel" id="panel-rooms" aria-labelledby="tab-rooms" hidden={tab !== 'rooms'}>
        <RoomsCard initial={settings.data.zones} />
      </div>
      <div role="tabpanel" id="panel-board" aria-labelledby="tab-board" hidden={tab !== 'board'}>
        <BoardCard />
      </div>
    </>
  );
}

/** One group of settings: a short explanation on the left, the controls on the right. */
function Section({
  title,
  text,
  children,
}: {
  title: string;
  text?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-text">
        <h3>{title}</h3>
        {text && <p className="muted small">{text}</p>}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
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

  const calm = profile.calmSupport;
  const setCalm = (patch: Partial<ChildProfile['calmSupport']>) =>
    set({ calmSupport: { ...calm, ...patch } });

  return (
    <Card className="settings-card">
      <Section title="Who Bhavya supports" text="The name and language used in every routine.">
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
        </div>
      </Section>

      <Section
        title="Words and support"
        text="How simple the steps are, and how much help a new routine starts with."
      >
        <div className="grid-2">
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
        </div>
      </Section>

      <Section title="Voice" text="How Bhavya sounds on the phone and the glasses.">
        <div className="grid-2">
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
        <div>
          <Button size="sm" icon="volume" onClick={testVoice}>
            Test the voice
          </Button>
        </div>
      </Section>

      <Section
        title="Pictures and breaks"
        text="What is shown on screen and offered during breaks."
      >
        <Switch checked={profile.showText} onChange={(showText) => set({ showText })}>
          Show words next to pictures
        </Switch>
        <Switch
          checked={profile.calming.breathing}
          onChange={(breathing) => set({ calming: { ...profile.calming, breathing } })}
        >
          Offer breathing on breaks
        </Switch>
        <Switch
          checked={profile.calming.music}
          onChange={(music) => set({ calming: { ...profile.calming, music } })}
        >
          Offer calm music on breaks
        </Switch>
      </Section>

      {suggestionsAvailable && (
        <Section title="Glasses suggestions" text="Offer a routine that fits the place.">
          <Switch
            checked={profile.glassesSuggestions}
            onChange={(glassesSuggestions) => set({ glassesSuggestions })}
          >
            Suggest routines from the glasses camera
          </Switch>
          <p className="field-hint">
            When no routine is running, the glasses take a look every 15 seconds and Muse checks
            whether a routine fits the place. The person is always asked first. Pictures are never
            saved. It stays off in private rooms and pauses for {privatePauseMinutes}{' '}
            {privatePauseMinutes === 1 ? 'minute' : 'minutes'} after seeing a bathroom or a place to
            change.
          </p>
        </Section>
      )}

      {calmAvailable && (
        <Section title="Calm support" text="Offer a quiet break when the person seems upset.">
          <Switch checked={calm.enabled} onChange={(enabled) => setCalm({ enabled })}>
            Turn on Calm support
          </Switch>
          {calm.enabled && (
            <>
              <div className="grid-2">
                <Field label="Very loud for">
                  <select
                    value={calm.loudSeconds}
                    onChange={(e) => setCalm({ loudSeconds: Number(e.target.value) })}
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
                    value={calm.loudLevel}
                    onChange={(e) => setCalm({ loudLevel: Number(e.target.value) })}
                  >
                    <option value={60}>Sensitive (raised voices)</option>
                    <option value={75}>Normal (shouting)</option>
                    <option value={85}>Only very loud (screaming)</option>
                  </select>
                </Field>
              </div>
              <Switch
                checked={calm.watchDistress}
                onChange={(watchDistress) => setCalm({ watchDistress })}
              >
                Also let the room camera look for signs of distress (crying, covering ears)
              </Switch>
            </>
          )}
          <p className="field-hint">
            Needs a room device: open /room on an old phone or laptop in a room where the camera is
            allowed. Nothing is recorded, private rooms are never watched, and harmless movements
            like rocking or hand-flapping are never counted. They can always say &quot;Not
            now&quot;, and you get a notification.
          </p>
        </Section>
      )}

      <div className="settings-foot">
        <StatusNote status={status} />
        <Button variant="primary" icon="check" busy={saving} onClick={() => void save()}>
          Save
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
      <div className="card-head">
        <div>
          <h2>Rooms</h2>
          <p className="muted small">
            Private rooms never use the camera, and video teaching is not offered for them. Rooms
            with a smart light can switch it on when a routine starts.
          </p>
        </div>
        <Button icon="plus" onClick={addRoom} disabled={zones.length >= 12}>
          Add room
        </Button>
      </div>
      <div className="room-rows">
        <div className="room-row room-row-head" aria-hidden="true">
          <span />
          <span>Room</span>
          <span>Privacy</span>
          <span>Smart light id</span>
          <span />
        </div>
        {zones.map((zone, index) => {
          const isPrivate = zone.type === 'private';
          return (
            <div key={index} className={`room-row ${isPrivate ? 'is-private' : ''}`}>
              <span className="room-icon" title={isPrivate ? 'Private' : 'Camera allowed'}>
                <Icon name={isPrivate ? 'lock' : 'camera'} size={18} />
              </span>
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
              <input
                type="text"
                aria-label="Smart light id"
                placeholder="No smart light"
                value={zone.light ?? ''}
                maxLength={40}
                onChange={(e) => update(index, { light: e.target.value.trim() || null })}
              />
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                aria-label={`Remove ${zone.name}`}
                disabled={zones.length === 1}
                onClick={() => setZones((list) => list.filter((_, i) => i !== index))}
              />
            </div>
          );
        })}
      </div>
      <StatusNote status={status} />
      <div className="settings-foot">
        <Button variant="primary" icon="check" busy={saving} onClick={() => void save()}>
          Save rooms
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
      <div className="card-head">
        <div>
          <h2>Communication board pictures</h2>
          <p className="muted small">
            These pictures let the person say something without speaking. Muse Image draws a simple
            picture for each one.
          </p>
        </div>
        <Button
          icon="sparkle"
          disabled={!!busy || missing.length === 0}
          onClick={() => void make(missing)}
        >
          {missing.length > 0 ? `Draw ${missing.length} missing pictures` : 'All pictures drawn'}
        </Button>
      </div>
      <StatusNote status={status} />
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
            <figcaption>{phrase.label}</figcaption>
            <Button
              size="sm"
              variant="ghost"
              icon={icons[phrase.id] ? 'refresh' : 'sparkle'}
              busy={busy === phrase.id}
              disabled={!!busy}
              onClick={() => void make([phrase.id])}
            >
              {icons[phrase.id] ? 'Redraw' : 'Draw'}
            </Button>
          </figure>
        ))}
      </div>
    </Card>
  );
}
