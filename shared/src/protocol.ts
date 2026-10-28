import { z } from 'zod';
import { BOARD_PHRASE_IDS } from './board';
import type { HomeState, Notification } from './state';

export const clientRoleSchema = z.enum(['child', 'parent', 'simulator']);
export type ClientRole = z.infer<typeof clientRoleSchema>;

const runRef = { runId: z.string().min(1) };

/** Messages sent from a browser or app to the home hub over WebSocket. */
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), role: clientRoleSchema }),
  z.object({ type: z.literal('start_mission'), missionId: z.string().min(1) }),
  z.object({ type: z.literal('step_done'), ...runRef, stepIndex: z.number().int().min(0) }),
  z.object({ type: z.literal('help'), runId: z.string().min(1).nullable() }),
  z.object({ type: z.literal('stop'), ...runRef }),
  z.object({ type: z.literal('break'), ...runRef, onBreak: z.boolean() }),
  z.object({ type: z.literal('set_assistant'), enabled: z.boolean() }),
  z.object({ type: z.literal('board_say'), phraseId: z.enum(BOARD_PHRASE_IDS) }),
  z.object({ type: z.literal('zone_enter'), zone: z.string().min(1) }),
  z.object({ type: z.literal('zone_leave') }),
  z.object({ type: z.literal('set_light'), device: z.string().min(1), on: z.boolean() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Messages sent from the home hub to connected clients. */
export type ServerMessage =
  | { type: 'state'; state: HomeState }
  | { type: 'notification'; notification: Notification }
  | { type: 'notifications'; items: Notification[] }
  | { type: 'error'; message: string };
