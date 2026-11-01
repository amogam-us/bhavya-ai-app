import { useCallback, useState } from 'react';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return typeof value === typeof fallback ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * useState that remembers a small preference in this browser. Storage can be
 * unavailable (private mode, blocked site data); then it simply is not kept.
 */
export function useStoredState<T extends string | number | boolean>(
  key: string,
  fallback: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? next(previous) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Not kept; the setting still applies for this visit.
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update];
}
