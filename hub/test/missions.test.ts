import { DEFAULT_ZONES, type Zone } from '@bhavya/shared';
import { describe, expect, it } from 'vitest';
import { normalizeDraft } from '../src/missions/drafts';
import { missionProblems } from '../src/missions/rules';
import type { MissionDraft } from '../src/muse/schemas';
import { createHarness } from './helpers';

const zone = (id: string): Zone => DEFAULT_ZONES.find((z) => z.id === id)!;

const draft: MissionDraft = {
  title: 'Brush teeth',
  steps: [
    {
      action: '  Get your   toothbrush ',
      object: 'toothbrush',
      full: 'Take your toothbrush from the cup.',
      short: 'Toothbrush.',
      ifStuck: 'The cup is next to the sink.',
      check: 'vision',
      expect: 'a toothbrush in a hand',
      timeoutSec: 9999,
      safety: ['', 'Use a soft brush.'],
      keyFrame: 4,
    },
  ],
};

describe('normalizeDraft', () => {
  it('forces tap checks in private rooms, whatever the model said', () => {
    const { input } = normalizeDraft(draft, { zone: zone('restroom'), autoStart: true });
    expect(input.steps[0]).toMatchObject({ check: 'tap', expect: null });
  });

  it('keeps vision checks in camera-OK rooms and cleans up values', () => {
    const { input, keyFrames } = normalizeDraft(draft, {
      zone: zone('living_room'),
      autoStart: false,
    });
    const step = input.steps[0]!;
    expect(step).toMatchObject({
      action: 'Get your toothbrush',
      check: 'vision',
      expect: 'a toothbrush in a hand',
      timeoutSec: 300,
      safety: ['Use a soft brush.'],
    });
    expect(keyFrames[step.id]).toBe(4);
    expect(input.trigger).toBe('manual');
    expect(input.onStart).toEqual([]);
  });

  it('switches the room light for routines that start automatically', () => {
    const { input } = normalizeDraft(draft, { zone: zone('restroom'), autoStart: true });
    expect(input.trigger).toBe('zone_enter');
    expect(input.onStart).toEqual([{ type: 'light_on', delaySec: 0 }]);
    expect(input.onEnd).toEqual([{ type: 'light_off', delaySec: 120 }]);
  });

  it('prefers the title the parent typed', () => {
    const { input } = normalizeDraft(draft, {
      zone: zone('kitchen'),
      autoStart: false,
      title: 'Teeth',
    });
    expect(input.title).toBe('Teeth');
  });
});

describe('missionProblems', () => {
  it('rejects camera checks in private rooms', () => {
    const h = createHarness();
    const restroom = h.mission('Using');
    const edited = {
      ...restroom,
      steps: restroom.steps.map((s, i) => (i === 0 ? { ...s, check: 'vision' as const } : s)),
    };
    const problems = missionProblems(edited, {
      zones: DEFAULT_ZONES,
      missions: h.repos.missions.list(),
      missionId: restroom.id,
    });
    expect(problems.join(' ')).toContain('private');
  });

  it('allows only one automatic routine per room', () => {
    const h = createHarness();
    const restroom = h.mission('Using');
    const problems = missionProblems(restroom, {
      zones: DEFAULT_ZONES,
      missions: h.repos.missions.list(),
      missionId: 'another-mission',
    });
    expect(problems.join(' ')).toContain('already starts automatically');
  });

  it('accepts the demo routines', () => {
    const h = createHarness();
    for (const mission of h.repos.missions.list()) {
      expect(
        missionProblems(mission, {
          zones: DEFAULT_ZONES,
          missions: h.repos.missions.list(),
          missionId: mission.id,
        }),
      ).toEqual([]);
    }
  });
});
