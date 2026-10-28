import {
  draftFromDemoSchema,
  draftFromTextSchema,
  missionInputSchema,
  uploadCardSchema,
} from '@bhavya/shared';
import type { FastifyInstance } from 'fastify';
import { parseOrThrow } from '../../lib/errors';
import type { AppContext } from '../context';

type IdParams = { Params: { id: string } };
type StepParams = { Params: { id: string; stepId: string } };

export function missionRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { missions } = ctx;

  app.get('/api/missions', async () => missions.list());

  app.get<IdParams>('/api/missions/:id', async (req) => missions.get(req.params.id));

  app.post('/api/missions/draft/text', async (req) => {
    const body = parseOrThrow(draftFromTextSchema, req.body);
    return missions.draftFromText(body);
  });

  app.post('/api/missions/draft/demo', async (req) => {
    const body = parseOrThrow(draftFromDemoSchema, req.body);
    return missions.draftFromDemo(body);
  });

  app.put<IdParams>('/api/missions/:id', async (req) => {
    const body = parseOrThrow(missionInputSchema, req.body);
    return missions.update(req.params.id, body);
  });

  app.post<IdParams>('/api/missions/:id/approve', async (req) => missions.approve(req.params.id));

  app.delete<IdParams>('/api/missions/:id', async (req, reply) => {
    await missions.delete(req.params.id);
    return reply.status(204).send();
  });

  app.post<StepParams>('/api/missions/:id/steps/:stepId/card', async (req) =>
    missions.generateCard(req.params.id, req.params.stepId),
  );

  app.put<StepParams>('/api/missions/:id/steps/:stepId/card', async (req) => {
    const body = parseOrThrow(uploadCardSchema, req.body);
    return missions.uploadCard(req.params.id, req.params.stepId, body.image);
  });
}
