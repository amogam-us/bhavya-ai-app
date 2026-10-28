import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { MuseClient, MuseError } from '../src/muse/client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function answer(text: string) {
  return {
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text }] },
    ],
  };
}

const request = {
  instructions: 'test',
  content: [{ type: 'input_text' as const, text: 'hi' }],
  schemaName: 'test',
  schema: {},
  effort: 'minimal' as const,
  parse: (v: unknown) => z.object({ ok: z.boolean() }).parse(v),
};

function client(fetchImpl: typeof fetch) {
  return new MuseClient({
    apiKey: 'key',
    baseUrl: 'https://api.test/v1',
    fetchImpl,
    retryDelayMs: 1,
  });
}

describe('MuseClient.structured', () => {
  it('sends a strict JSON schema request without storing it, and parses the answer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(answer('{"ok":true}')));
    await expect(client(fetchImpl).structured(request)).resolves.toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/responses');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: 'muse-spark-1.3',
      store: false,
      reasoning: { effort: 'minimal' },
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key');
  });

  it('retries server errors and then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'busy' } }, 503))
      .mockResolvedValueOnce(jsonResponse(answer('{"ok":false}')));
    await expect(client(fetchImpl).structured(request)).resolves.toEqual({ ok: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors and reports the API message', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'bad schema' } }, 400));
    await expect(client(fetchImpl).structured(request)).rejects.toMatchObject({
      name: 'MuseError',
      status: 400,
      message: 'bad schema',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget on network failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(client(fetchImpl).structured(request)).rejects.toBeInstanceOf(MuseError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects answers that are not valid JSON or have the wrong shape', async () => {
    const notJson = vi.fn(async () => jsonResponse(answer('not json')));
    await expect(client(notJson).structured(request)).rejects.toThrow('not valid JSON');
    const wrongShape = vi.fn(async () => jsonResponse(answer('{"ok":"yes"}')));
    await expect(client(wrongShape).structured(request)).rejects.toThrow('unexpected shape');
  });
});
