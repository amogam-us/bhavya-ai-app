import type { ChildProfile, ObjectBox, Step, Zone } from '@bhavya/shared';
import { MuseError, type ContentPart, type MuseClient } from './client';
import {
  groundingInstructions,
  missionDraftInstructions,
  stepCheckInstructions,
  stepCheckQuestion,
} from './prompts';
import { parseSamBoxes } from './sam';
import {
  groundingJsonSchema,
  groundingSchema,
  missionDraftJsonSchema,
  missionDraftSchema,
  stepCheckJsonSchema,
  stepCheckSchema,
  type MissionDraft,
  type StepCheck,
} from './schemas';

interface Logger {
  warn(obj: object, msg: string): void;
}

export interface DraftMissionParams {
  profile: ChildProfile;
  zone: Zone;
  instructions?: string;
  narration?: string;
  /** Demonstration frames as image data URLs, in time order. */
  frames?: string[];
}

/** High-level Muse features used by Bhavya. */
export class MuseService {
  constructor(
    private readonly client: MuseClient,
    private readonly logger?: Logger,
  ) {}

  async draftMission(params: DraftMissionParams): Promise<MissionDraft> {
    const frames = params.frames ?? [];
    const fromDemo = frames.length > 0;
    const content: ContentPart[] = [];

    if (params.instructions) {
      content.push({ type: 'input_text', text: `Parent's instructions:\n${params.instructions}` });
    }
    if (fromDemo) {
      const narration = params.narration
        ? `Parent's narration while demonstrating:\n${params.narration}`
        : 'There is no narration; infer the steps from the frames.';
      content.push({
        type: 'input_text',
        text: `The parent demonstrated the routine. The frames below are in time order, numbered from 0.\n${narration}`,
      });
      frames.forEach((image, index) => {
        content.push({ type: 'input_text', text: `Frame ${index}` });
        content.push({ type: 'input_image', image_url: image });
      });
    }
    if (content.length === 0)
      throw new Error('A draft needs instructions or demonstration frames.');

    return this.client.structured({
      instructions: missionDraftInstructions({
        profile: params.profile,
        zone: params.zone,
        fromDemo,
      }),
      content,
      schemaName: 'mission_draft',
      schema: missionDraftJsonSchema,
      parse: (v) => missionDraftSchema.parse(v),
      effort: fromDemo ? 'medium' : 'low',
      timeoutMs: fromDemo ? 150_000 : 90_000,
    });
  }

  async checkStep(params: {
    profile: ChildProfile;
    step: Step;
    image: string;
  }): Promise<StepCheck> {
    return this.client.structured({
      instructions: stepCheckInstructions(params.profile),
      content: [
        { type: 'input_text', text: stepCheckQuestion(params.step) },
        { type: 'input_image', image_url: params.image },
      ],
      schemaName: 'step_check',
      schema: stepCheckJsonSchema,
      parse: (v) => stepCheckSchema.parse(v),
      effort: 'minimal',
      timeoutMs: 30_000,
    });
  }

  /**
   * Finds an object with SAM 3.1. If SAM is unavailable, falls back to
   * Muse Spark perception grounding so the object finder keeps working.
   */
  async findObject(object: string, image: string): Promise<ObjectBox[]> {
    try {
      return parseSamBoxes(await this.client.segment(object, image)).slice(0, 3);
    } catch (error) {
      if (!(error instanceof MuseError)) throw error;
      this.logger?.warn(
        { err: error.message },
        'SAM 3.1 failed, falling back to Muse Spark grounding',
      );
      return this.groundObject(object, image);
    }
  }

  async makePicture(prompt: string): Promise<Buffer> {
    return this.client.generateImage(prompt);
  }

  async transcribe(wav: Buffer): Promise<string> {
    return this.client.transcribe(wav);
  }

  private async groundObject(object: string, image: string): Promise<ObjectBox[]> {
    const result = await this.client.structured({
      instructions: groundingInstructions(),
      content: [
        { type: 'input_text', text: `Find: ${object}` },
        { type: 'input_image', image_url: image },
      ],
      schemaName: 'grounding',
      schema: groundingJsonSchema,
      parse: (v) => groundingSchema.parse(v),
      effort: 'minimal',
      timeoutMs: 30_000,
    });
    if (!result.found) return [];
    const clamp = (v: number) => Math.max(0, Math.min(1000, v)) / 1000;
    const x = clamp(Math.min(result.x_min, result.x_max));
    const y = clamp(Math.min(result.y_min, result.y_max));
    const width = clamp(Math.max(result.x_min, result.x_max)) - x;
    const height = clamp(Math.max(result.y_min, result.y_max)) - y;
    return width > 0 && height > 0 ? [{ x, y, width, height, confidence: 0.5 }] : [];
  }
}
