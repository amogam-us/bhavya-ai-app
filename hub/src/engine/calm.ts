import type { ChildProfile } from '@bhavya/shared';

export type CalmRules = ChildProfile['calmSupport'];

/** Why a quiet break is being offered. */
export type CalmTrigger = { kind: 'loud'; seconds: number } | { kind: 'distress'; signs: string };

/** What Muse saw in a burst of room-camera frames. */
export interface DistressResult {
  distress: boolean;
  signs: string;
  confidence: number;
}

/** A sound report older than this breaks a loud streak (devices report every second). */
export const SOUND_GAP_MS = 3000;
/** Minimum confidence for a distress look to count. */
export const DISTRESS_CONFIDENCE = 0.75;
/** Distress must be seen in this many looks in a row before acting. */
export const DISTRESS_LOOKS = 2;

/**
 * Turns room-device reports into "offer a quiet break now" decisions. It only
 * counts: the engine decides whether support is allowed at all (room, privacy,
 * settings) and what happens next.
 */
export class CalmMonitor {
  private loudSince: number | null = null;
  private lastSoundAt = -Infinity;
  private distressLooks = 0;
  private quietUntil = 0;

  constructor(private readonly now: () => number) {}

  /** A loudness report (0 to 100). Returns a trigger when the loud rule is met. */
  sound(level: number, rules: CalmRules): CalmTrigger | null {
    const now = this.now();
    if (now - this.lastSoundAt > SOUND_GAP_MS) this.loudSince = null;
    this.lastSoundAt = now;
    if (level < rules.loudLevel) {
      this.loudSince = null;
      return null;
    }
    this.loudSince ??= now;
    const seconds = (now - this.loudSince) / 1000;
    if (seconds < rules.loudSeconds || this.snoozed(now)) return null;
    this.loudSince = null;
    return { kind: 'loud', seconds: Math.round(seconds) };
  }

  /**
   * A room-camera look. Returns a trigger when distress is seen confidently in
   * enough looks in a row, 'watching' after the first one, 'snoozed' when an
   * offer would come too soon after the last one, and null when all is calm.
   */
  distress(result: DistressResult): CalmTrigger | 'watching' | 'snoozed' | null {
    if (!result.distress || result.confidence < DISTRESS_CONFIDENCE) {
      this.distressLooks = 0;
      return null;
    }
    this.distressLooks += 1;
    if (this.distressLooks < DISTRESS_LOOKS) return 'watching';
    this.distressLooks = 0;
    if (this.snoozed(this.now())) return 'snoozed';
    return { kind: 'distress', signs: result.signs };
  }

  /** No new offers until `ms` from now (after an offer, or after "Not now"). */
  snooze(ms: number): void {
    this.quietUntil = Math.max(this.quietUntil, this.now() + ms);
  }

  /** Forgets streaks, for example when the child changes rooms. Snoozes stay. */
  reset(): void {
    this.loudSince = null;
    this.distressLooks = 0;
  }

  private snoozed(now: number): boolean {
    return now < this.quietUntil;
  }
}
