import { missionSchema, type Mission, type Step } from '@bhavya/shared';
import type { Repositories } from './db/repositories';
import { newId, newShortId, nowIso } from './lib/ids';

type SeedStep = Omit<Step, 'id' | 'card' | 'safety' | 'object' | 'expect' | 'check'> &
  Partial<Pick<Step, 'safety' | 'object' | 'expect' | 'check'>>;

function step(s: SeedStep): Step {
  return {
    id: newShortId(),
    card: null,
    safety: [],
    object: null,
    expect: null,
    check: 'tap',
    ...s,
  };
}

function restroomMission(now: string): Mission {
  return {
    id: newId(),
    title: 'Using the restroom',
    zone: 'restroom',
    trigger: 'zone_enter',
    onStart: [{ type: 'light_on', delaySec: 0 }],
    onEnd: [{ type: 'light_off', delaySec: 120 }],
    status: 'approved',
    source: 'seed',
    createdAt: now,
    updatedAt: now,
    steps: [
      step({
        action: 'Close the door',
        prompts: { full: 'Close the door. Push it until it clicks.', short: 'Close the door.' },
        ifStuck: 'The door is behind you. Push it gently until it clicks.',
        timeoutSec: 45,
      }),
      step({
        action: 'Lock the door if you want',
        prompts: {
          full: 'If you want privacy, turn the lock. You can always open it again.',
          short: 'Lock if you want.',
        },
        ifStuck: 'The lock is the small knob on the door. Turning it is your choice.',
        timeoutSec: 45,
        safety: ['Locking is optional. The door never locks by itself.'],
      }),
      step({
        action: 'Lift the toilet lid',
        prompts: { full: 'Lift the toilet lid up.', short: 'Lid up.' },
        ifStuck: 'The lid is the top cover of the toilet. Lift it up with one hand.',
        timeoutSec: 45,
      }),
      step({
        action: 'Use the toilet',
        prompts: { full: 'Pull your pants down and sit on the toilet.', short: 'Use the toilet.' },
        ifStuck: 'Sit on the toilet. Take your time.',
        timeoutSec: 300,
      }),
      step({
        action: 'Wipe and flush',
        prompts: {
          full: 'Use toilet paper to wipe. Then press the flush button.',
          short: 'Wipe and flush.',
        },
        ifStuck: 'The toilet paper is next to the toilet. The flush button is on top.',
        timeoutSec: 90,
      }),
      step({
        action: 'Wash your hands',
        prompts: {
          full: 'Wet your hands, add soap, and rub them while you count to twenty. Then rinse.',
          short: 'Wash hands.',
        },
        ifStuck: 'Go to the sink. Turn on the water, then press the soap.',
        timeoutSec: 90,
        safety: ['Use warm water, not hot.'],
      }),
      step({
        action: 'Dry your hands',
        prompts: { full: 'Dry your hands on the towel.', short: 'Dry hands.' },
        ifStuck: 'The towel is next to the sink.',
        timeoutSec: 45,
      }),
      step({
        action: 'Open the door and leave',
        prompts: {
          full: 'Unlock the door if it is locked, open it and go out. Well done!',
          short: 'Open the door.',
        },
        ifStuck: 'Turn the knob on the door, then pull the door open.',
        timeoutSec: 60,
      }),
    ],
  };
}

function schoolBagMission(now: string): Mission {
  return {
    id: newId(),
    title: 'Pack your school bag',
    zone: 'living_room',
    trigger: 'manual',
    onStart: [],
    onEnd: [],
    status: 'approved',
    source: 'seed',
    createdAt: now,
    updatedAt: now,
    steps: [
      step({
        action: 'Get your school bag',
        object: 'school bag',
        prompts: { full: 'Get your school bag and open it on the table.', short: 'Open your bag.' },
        ifStuck: 'Your school bag is near the door. Bring it to the table.',
        check: 'vision',
        expect: 'an open school bag on a table',
        timeoutSec: 90,
      }),
      step({
        action: 'Pack the pencil case',
        object: 'pencil case',
        prompts: { full: 'Find your pencil case. Put it in your bag.', short: 'Pencil case in.' },
        ifStuck: 'Look on the table. Your pencil case is blue.',
        check: 'vision',
        expect: 'a pencil case inside an open school bag',
        timeoutSec: 60,
      }),
      step({
        action: 'Pack the water bottle',
        object: 'water bottle',
        prompts: { full: 'Find your water bottle. Put it in your bag.', short: 'Bottle in.' },
        ifStuck: 'Your water bottle is red. Look on the table.',
        check: 'vision',
        expect: 'a water bottle inside the school bag',
        timeoutSec: 60,
      }),
      step({
        action: 'Pack your lunch box',
        object: 'lunch box',
        prompts: { full: 'Find your lunch box. Put it in your bag.', short: 'Lunch box in.' },
        ifStuck: 'Your lunch box is in the kitchen, next to the fridge.',
        check: 'vision',
        expect: 'a lunch box inside the school bag',
        timeoutSec: 90,
      }),
      step({
        action: 'Close your bag',
        object: 'school bag',
        prompts: { full: 'Close the zip on your bag. You are ready!', short: 'Close the bag.' },
        ifStuck: 'Pull the zip all the way around.',
        check: 'vision',
        expect: 'a closed school bag',
        timeoutSec: 60,
      }),
    ],
  };
}

/** Adds the two demo routines when the database has no routines yet. */
export function seedIfEmpty(repos: Repositories): number {
  if (repos.missions.count() > 0) return 0;
  const now = nowIso();
  const missions = [restroomMission(now), schoolBagMission(now)].map((m) => missionSchema.parse(m));
  missions.forEach((m) => repos.missions.insert(m));
  return missions.length;
}
