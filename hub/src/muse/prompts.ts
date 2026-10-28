import type { ChildProfile, Step, Zone } from '@bhavya/shared';

/** Rules that apply to every prompt that looks at camera images. */
const VISION_PRIVACY_RULES =
  'Look only at objects, places and their state. Never describe, judge or comment on people, ' +
  'faces, bodies, emotions or movements.';

function readingStyle(profile: ChildProfile): string {
  return profile.readingLevel === 'simple'
    ? 'Use very short sentences, simple everyday words and one action per sentence.'
    : 'Use short, clear sentences.';
}

export function missionDraftInstructions(params: {
  profile: ChildProfile;
  zone: Zone;
  fromDemo: boolean;
}): string {
  const { profile, zone, fromDemo } = params;
  const cameraRule =
    zone.type === 'private'
      ? `The ${zone.name} is a private room. The camera is never used there, so every step must use check "tap" and expect "".`
      : `The ${zone.name} allows the camera. Use check "vision" only when finishing the step leaves a result a camera can clearly see (for example an object inside a bag). Otherwise use "tap".`;

  return [
    `You turn a parent's routine into a step-by-step mission for ${profile.name}, an autistic child.`,
    `Write every child-facing text in ${profile.language}. ${readingStyle(profile)}`,
    'The guidance is spoken through smart glasses and shown on picture cards.',
    '',
    'Rules for each step:',
    '- Make 3 to 10 steps, in order, with exactly one action per step.',
    '- action: a 2 to 6 word title, like "Wash your hands".',
    '- full: one or two short, kind sentences saying exactly what to do. Say what to do, not what not to do.',
    '- short: a 1 to 4 word reminder.',
    '- ifStuck: a simpler, calm explanation with a concrete clue (where to look or what it looks like).',
    '- object: the one physical object the step needs, as a short noun phrase a camera could find (like "toothbrush"), or "" if none.',
    `- ${cameraRule}`,
    '- expect: for "vision" steps, what a photo shows when the step is done. Otherwise "".',
    '- timeoutSec: realistic seconds for this child to finish the step, between 20 and 300.',
    '- safety: short notes only when truly relevant (water temperature, hot or sharp things), otherwise [].',
    fromDemo
      ? '- keyFrame: the index of the demonstration frame that best shows this step, or -1.'
      : '- keyFrame: always -1.',
    '',
    'Hard rules:',
    '- Never give medical, therapy or diet advice.',
    '- Never praise or correct the child for how they move, look or feel. Repetitive movements are fine.',
    '- Locking a door is always optional and done by the child. Never say a door will lock automatically.',
    '- title: a short, friendly name for the whole mission.',
  ].join('\n');
}

export function stepCheckInstructions(profile: ChildProfile): string {
  return [
    'You check whether one step of a daily routine is finished, using one camera frame from smart glasses.',
    VISION_PRIVACY_RULES,
    'Set done to true only when the frame clearly shows the finished result.',
    'confidence is between 0 and 1.',
    `hint: when not done, one short, kind sentence in ${profile.language} saying what to do next, mentioning where the object is if you can see it. When done, "".`,
  ].join('\n');
}

export function stepCheckQuestion(step: Step): string {
  return [
    `Step: "${step.action}".`,
    `Done looks like: "${step.expect ?? step.action}".`,
    step.object ? `Object: "${step.object}".` : 'No specific object.',
    'Is this step finished in this frame?',
  ].join('\n');
}

export function groundingInstructions(): string {
  return [
    'You locate one object in a camera frame.',
    VISION_PRIVACY_RULES,
    'Return the object box on the normalized 0-1000 grid, (0,0) top-left.',
    'If the object is not visible, set found to false and all coordinates to 0.',
  ].join('\n');
}

export function cardPrompt(step: Pick<Step, 'action' | 'object'>): string {
  const subject = step.object ? `${step.action} (showing a ${step.object})` : step.action;
  return (
    `Picture card for a visual schedule used by a young autistic child. It shows: ${subject}. ` +
    'Simple flat cartoon illustration, one clear subject in the centre, thick soft outlines, ' +
    'gentle friendly colours, plain white background. No text, no letters, no numbers. ' +
    'If a person is needed, show only hands.'
  );
}

export function boardIconPrompt(picture: string): string {
  return (
    `Simple icon for a child's picture communication board: ${picture}. ` +
    'Flat cartoon style, one subject in the centre, thick outlines, bright gentle colours, ' +
    'plain white background. No text, no letters.'
  );
}
