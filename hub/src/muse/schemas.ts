import { z } from 'zod';
import type { JsonSchema } from './client';

/*
 * JSON schemas sent to Muse Spark for structured output, each paired with a zod
 * schema that validates the answer. Strict mode requires every property to be
 * listed in "required" and additionalProperties to be false, so "none" values
 * use an empty string or -1 instead of null.
 */

export const missionDraftJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          object: { type: 'string' },
          full: { type: 'string' },
          short: { type: 'string' },
          ifStuck: { type: 'string' },
          check: { type: 'string', enum: ['tap', 'vision'] },
          expect: { type: 'string' },
          timeoutSec: { type: 'integer' },
          safety: { type: 'array', items: { type: 'string' } },
          keyFrame: { type: 'integer' },
        },
        required: [
          'action',
          'object',
          'full',
          'short',
          'ifStuck',
          'check',
          'expect',
          'timeoutSec',
          'safety',
          'keyFrame',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'steps'],
  additionalProperties: false,
};

export const missionDraftSchema = z.object({
  title: z.string(),
  steps: z
    .array(
      z.object({
        action: z.string(),
        object: z.string(),
        full: z.string(),
        short: z.string(),
        ifStuck: z.string(),
        check: z.enum(['tap', 'vision']),
        expect: z.string(),
        timeoutSec: z.number(),
        safety: z.array(z.string()),
        keyFrame: z.number(),
      }),
    )
    .min(1),
});
export type MissionDraft = z.infer<typeof missionDraftSchema>;
export type DraftStep = MissionDraft['steps'][number];

export const stepCheckJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    done: { type: 'boolean' },
    confidence: { type: 'number' },
    objectVisible: { type: 'boolean' },
    hint: { type: 'string' },
  },
  required: ['done', 'confidence', 'objectVisible', 'hint'],
  additionalProperties: false,
};

export const stepCheckSchema = z.object({
  done: z.boolean(),
  confidence: z.number(),
  objectVisible: z.boolean(),
  hint: z.string(),
});
export type StepCheck = z.infer<typeof stepCheckSchema>;

export const groundingJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    x_min: { type: 'integer' },
    y_min: { type: 'integer' },
    x_max: { type: 'integer' },
    y_max: { type: 'integer' },
  },
  required: ['found', 'x_min', 'y_min', 'x_max', 'y_max'],
  additionalProperties: false,
};

export const groundingSchema = z.object({
  found: z.boolean(),
  x_min: z.number(),
  y_min: z.number(),
  x_max: z.number(),
  y_max: z.number(),
});
