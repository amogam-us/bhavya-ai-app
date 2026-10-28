/**
 * Keeps demonstration frames in memory between "create from video" and the
 * editor, so the parent can turn a frame into a real-object picture card.
 * Frames are never uploaded except for the Muse draft and object-finder calls.
 */
const store = new Map<string, { frames: string[]; keyFrames: Record<string, number> }>();

export const demoFrames = {
  set(missionId: string, frames: string[], keyFrames: Record<string, number>): void {
    store.clear();
    store.set(missionId, { frames, keyFrames });
  },
  frameFor(missionId: string, stepId: string): string | null {
    const entry = store.get(missionId);
    const index = entry?.keyFrames[stepId];
    return entry && index !== undefined ? (entry.frames[index] ?? null) : null;
  },
};
