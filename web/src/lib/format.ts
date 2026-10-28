import type { PromptLevel } from '@bhavya/shared';

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const LEVEL_LABELS: Record<PromptLevel, string> = {
  3: 'Full guidance',
  2: 'Short reminder',
  1: 'Chime only',
  0: 'Independent',
};

/** Builds a room id from its name, e.g. "Play room" -> "play_room". */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return /^[a-z]/.test(slug) ? slug : `room_${slug}`.slice(0, 32);
}
