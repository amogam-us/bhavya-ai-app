import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/** Short id for things that only need to be unique inside one mission, like steps. */
export function newShortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}
