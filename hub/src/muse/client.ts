/**
 * Thin client for the Meta Model API. Only Muse-family models are used.
 * Responsibilities: auth, timeouts, retries, and decoding responses.
 */

export const MUSE_MODELS = {
  /** Reasoning and vision. Never the "-contributor" variant: those may train on our data. */
  reasoning: 'muse-spark-1.3',
  segmentation: 'sam-3.1',
  image: 'muse-image-1.0',
  transcribe: 'muse-voice-transcribe-1.0',
} as const;

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export type ContentPart =
  { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string };

export type JsonSchema = Record<string, unknown>;

export class MuseError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'MuseError';
  }
}

export interface MuseClientOptions {
  apiKey: string;
  baseUrl: string;
  /** Overridable for tests. */
  fetchImpl?: typeof fetch;
  /** Base delay between retries, in ms. */
  retryDelayMs?: number;
}

interface RequestOptions {
  timeoutMs: number;
  retries: number;
}

export interface StructuredRequest<T> {
  instructions: string;
  content: ContentPart[];
  schemaName: string;
  schema: JsonSchema;
  effort: ReasoningEffort;
  /** Validates the decoded JSON. Should throw on invalid input. */
  parse: (value: unknown) => T;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export class MuseClient {
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelayMs: number;

  constructor(private readonly options: MuseClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retryDelayMs = options.retryDelayMs ?? 600;
  }

  /** Calls Muse Spark with a JSON schema and returns the validated result. */
  async structured<T>(request: StructuredRequest<T>): Promise<T> {
    const body = {
      model: MUSE_MODELS.reasoning,
      instructions: request.instructions,
      input: [{ type: 'message', role: 'user', content: request.content }],
      reasoning: { effort: request.effort },
      text: {
        format: {
          type: 'json_schema',
          name: request.schemaName,
          schema: request.schema,
          strict: true,
        },
      },
      store: false,
    };
    const response = await this.postJson('/responses', body, {
      timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retries: 2,
    });
    const text = extractOutputText(response);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new MuseError('Muse Spark returned text that is not valid JSON.');
    }
    try {
      return request.parse(value);
    } catch {
      throw new MuseError('Muse Spark returned JSON in an unexpected shape.');
    }
  }

  /** Runs SAM 3.1 with a text prompt and returns its raw token output. */
  async segment(phrase: string, imageDataUrl: string): Promise<string> {
    const body = {
      model: MUSE_MODELS.segmentation,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: phrase },
            { type: 'input_image', image_url: imageDataUrl },
          ],
        },
      ],
      metadata: { include_confidence: 'true' },
      stream: false,
      store: false,
    };
    const response = await this.postJson('/responses', body, { timeoutMs: 30_000, retries: 1 });
    return extractOutputText(response);
  }

  /** Generates one PNG image with Muse Image. */
  async generateImage(prompt: string): Promise<Buffer> {
    const response = (await this.postJson(
      '/images/generations',
      { model: MUSE_MODELS.image, prompt, n: 1 },
      { timeoutMs: 120_000, retries: 1 },
    )) as { data?: { b64_json?: string }[] };
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new MuseError('Muse Image returned no image.');
    return Buffer.from(b64, 'base64');
  }

  /** Transcribes a WAV clip with Muse Voice Transcribe. */
  async transcribe(wav: Buffer): Promise<string> {
    const form = new FormData();
    form.append(
      'request',
      new Blob(
        [
          JSON.stringify({
            model: MUSE_MODELS.transcribe,
            audioEncoding: 'WAV',
            mode: 'PUSH_TO_TALK',
          }),
        ],
        { type: 'application/json' },
      ),
    );
    form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
    const response = await this.request(
      '/asr/transcribe',
      { method: 'POST', body: form, headers: { Accept: 'application/json' } },
      { timeoutMs: 60_000, retries: 1 },
    );
    const json = (await response.json()) as { transcript?: unknown };
    return typeof json.transcript === 'string' ? json.transcript.trim() : '';
  }

  private async postJson(path: string, body: unknown, options: RequestOptions): Promise<unknown> {
    const response = await this.request(
      path,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      options,
    );
    return response.json();
  }

  private async request(path: string, init: RequestInit, options: RequestOptions) {
    const url = `${this.options.baseUrl}${path}`;
    for (let attempt = 0; ; attempt++) {
      let failure: MuseError;
      try {
        const response = await this.fetchImpl(url, {
          ...init,
          headers: { ...init.headers, Authorization: `Bearer ${this.options.apiKey}` },
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        if (response.ok) return response;
        failure = new MuseError(await readErrorMessage(response), response.status);
        if (!isRetryableStatus(response.status)) throw failure;
      } catch (error) {
        if (error instanceof MuseError && !isRetryableStatus(error.status)) throw error;
        failure =
          error instanceof MuseError
            ? error
            : new MuseError(
                isTimeout(error)
                  ? 'The Meta Model API took too long to answer.'
                  : 'Could not reach the Meta Model API. Check the internet connection.',
              );
      }
      if (attempt >= options.retries) throw failure;
      await sleep(this.retryDelayMs * 2 ** attempt);
    }
  }
}

function isRetryableStatus(status: number | null): boolean {
  return status === null || status === 408 || status === 429 || status >= 500;
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: { message?: string } };
    if (json.error?.message) return json.error.message;
  } catch {
    // Body was not JSON; fall through to the status text.
  }
  return `HTTP ${response.status} ${response.statusText}`.trim();
}

/** Joins the text of every output_text part in a Responses API result. */
export function extractOutputText(response: unknown): string {
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) throw new MuseError('Unexpected response from the Meta Model API.');
  const parts: string[] = [];
  for (const item of output as { type?: string; content?: unknown }[]) {
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content as { type?: string; text?: unknown }[]) {
      if (part.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
    }
  }
  if (parts.length === 0) throw new MuseError('The Meta Model API returned an empty answer.');
  return parts.join('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
