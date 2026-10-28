import type { Mission, MissionInput, Zone } from '@bhavya/shared';

export interface RuleContext {
  zones: Zone[];
  missions: Mission[];
  /** Id of the mission being checked, so it does not conflict with itself. */
  missionId?: string;
}

/**
 * Safety and privacy rules every mission must follow. Returns human-readable
 * problems; an empty list means the mission is valid.
 */
export function missionProblems(input: MissionInput, ctx: RuleContext): string[] {
  const problems: string[] = [];
  const zone = ctx.zones.find((z) => z.id === input.zone);
  if (!zone) return ['Choose a room that exists.'];

  const ids = new Set<string>();
  for (const step of input.steps) {
    if (ids.has(step.id)) problems.push(`Step "${step.action}" has a duplicate id.`);
    ids.add(step.id);

    if (step.check === 'vision') {
      if (zone.type === 'private') {
        problems.push(
          `Step "${step.action}" uses a camera check, but the ${zone.name} is private. Use a tap check.`,
        );
      }
      if (!step.expect) {
        problems.push(`Step "${step.action}" needs a description of what "done" looks like.`);
      }
    }
  }

  if (!zone.light && (input.onStart.length > 0 || input.onEnd.length > 0)) {
    problems.push(`The ${zone.name} has no smart light, so the routine cannot switch lights.`);
  }

  if (input.trigger === 'zone_enter') {
    const other = ctx.missions.find(
      (m) =>
        m.id !== ctx.missionId &&
        m.status === 'approved' &&
        m.trigger === 'zone_enter' &&
        m.zone === input.zone,
    );
    if (other) {
      problems.push(`"${other.title}" already starts automatically in the ${zone.name}.`);
    }
  }

  return problems;
}
