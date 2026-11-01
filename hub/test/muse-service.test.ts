import { DEFAULT_PROFILE, DEFAULT_ZONES } from '@bhavya/shared';
import { describe, expect, it, vi } from 'vitest';
import { MuseClient } from '../src/muse/client';
import { MuseService } from '../src/muse/service';
import { createHarness } from './helpers';

/** A Muse service whose Spark model always answers with `answer`. */
function serviceAnswering(answer: unknown) {
  const fetchImpl = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: JSON.stringify(answer) }],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  );
  const client = new MuseClient({
    apiKey: 'key',
    baseUrl: 'https://api.test/v1',
    fetchImpl,
    retryDelayMs: 1,
  });
  return { muse: new MuseService(client), fetchImpl };
}

function sentPrompt(fetchImpl: ReturnType<typeof vi.fn>): string {
  const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.stringify(JSON.parse(init.body as string));
}

describe('MuseService', () => {
  const routines = createHarness().repos.missions.list();
  const restroom = routines.find((m) => m.zone === 'restroom')!;
  const context = {
    profile: DEFAULT_PROFILE,
    routines,
    zones: DEFAULT_ZONES,
    current: null,
    paused: null,
  };

  it('turns a spoken request into an intent for the engine', async () => {
    const { muse, fetchImpl } = serviceAnswering({
      action: 'start_routine',
      routineId: restroom.id,
      confidence: 1.4,
    });
    const intent = await muse.interpretRequest('I need the toilet', context);
    expect(intent).toEqual({ action: 'start_routine', missionId: restroom.id, confidence: 1 });
    const prompt = sentPrompt(fetchImpl);
    expect(prompt).toContain(restroom.id);
    expect(prompt).toContain('I need the toilet');
  });

  it('only keeps a routine id for routine requests', async () => {
    const { muse } = serviceAnswering({ action: 'help', routineId: restroom.id, confidence: 0.9 });
    const intent = await muse.interpretRequest('help me', context);
    expect(intent).toEqual({ action: 'help', missionId: null, confidence: 0.9 });
  });

  it('never suggests a routine for a private place', async () => {
    const { muse, fetchImpl } = serviceAnswering({
      private: true,
      routineId: restroom.id,
      confidence: 0.9,
    });
    const scene = await muse.checkScene('data:image/jpeg;base64,AAAA', {
      routines,
      zones: DEFAULT_ZONES,
    });
    expect(scene).toEqual({ private: true, missionId: null, confidence: 0.9 });
    expect(sentPrompt(fetchImpl)).toContain('Never describe');
  });

  it('treats an empty routine id as no match', async () => {
    const { muse } = serviceAnswering({ private: false, routineId: '', confidence: -2 });
    const scene = await muse.checkScene('data:image/jpeg;base64,AAAA', {
      routines,
      zones: DEFAULT_ZONES,
    });
    expect(scene).toEqual({ private: false, missionId: null, confidence: 0 });
  });
});
