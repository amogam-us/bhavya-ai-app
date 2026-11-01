import {
  clientMessageSchema,
  type ClientMessage,
  type ClientRole,
  type HomeState,
  type Notification,
  type ServerMessage,
  type TraceEntry,
} from '@bhavya/shared';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { EngineError } from '../engine/engine';
import type { AppContext } from './context';

const HEARTBEAT_MS = 30_000;

type CommandMessage = Exclude<ClientMessage, { type: 'hello' }>;

/** Which client role may send each command. */
const ALLOWED_ROLE: Record<CommandMessage['type'], ClientRole> = {
  start_mission: 'child',
  step_done: 'child',
  help: 'child',
  stop: 'child',
  break: 'child',
  set_assistant: 'child',
  board_say: 'child',
  suggestion_answer: 'child',
  zone_enter: 'simulator',
  zone_leave: 'simulator',
  set_light: 'simulator',
};

interface Client {
  role: ClientRole | null;
  alive: boolean;
}

/** The device bridge: pushes home state to every client and routes their commands to the engine. */
export function websocketRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { engine, repos } = ctx;
  const clients = new Map<WebSocket, Client>();

  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };

  const broadcast = (message: ServerMessage, roles?: ClientRole[]) => {
    for (const [socket, client] of clients) {
      if (client.role && (!roles || roles.includes(client.role))) send(socket, message);
    }
  };

  const onState = (state: HomeState) => broadcast({ type: 'state', state });
  const onNotification = (notification: Notification) =>
    broadcast({ type: 'notification', notification }, ['parent']);
  const onTrace = (entry: TraceEntry) => broadcast({ type: 'trace', entry }, ['simulator']);
  engine.on('state', onState);
  engine.on('notification', onNotification);
  engine.on('trace', onTrace);

  const heartbeat = setInterval(() => {
    for (const [socket, client] of clients) {
      if (!client.alive) {
        socket.terminate();
        clients.delete(socket);
        continue;
      }
      client.alive = false;
      socket.ping();
    }
  }, HEARTBEAT_MS);

  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
    engine.off('state', onState);
    engine.off('notification', onNotification);
    engine.off('trace', onTrace);
    for (const socket of clients.keys()) socket.close(1001, 'Hub shutting down');
    clients.clear();
  });

  app.get('/ws', { websocket: true }, (socket) => {
    const client: Client = { role: null, alive: true };
    clients.set(socket, client);
    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('message', (raw) => handleMessage(socket, client, raw.toString()));
    socket.on('close', () => clients.delete(socket));
    socket.on('error', (err) => app.log.warn({ err }, 'WebSocket error'));
  });

  function handleMessage(socket: WebSocket, client: Client, raw: string): void {
    let message: ClientMessage;
    try {
      message = clientMessageSchema.parse(JSON.parse(raw));
    } catch {
      send(socket, { type: 'error', message: 'Invalid message.' });
      return;
    }

    if (message.type === 'hello') {
      client.role = message.role;
      send(socket, { type: 'state', state: engine.getState() });
      if (message.role === 'parent') {
        send(socket, { type: 'notifications', items: repos.notifications.recent(30) });
      }
      if (message.role === 'simulator') {
        send(socket, { type: 'traces', items: engine.recentTraces() });
      }
      return;
    }

    if (client.role !== ALLOWED_ROLE[message.type]) {
      send(socket, { type: 'error', message: 'This device cannot do that.' });
      return;
    }

    try {
      dispatch(message);
    } catch (error) {
      if (error instanceof EngineError) {
        send(socket, { type: 'error', message: error.message });
      } else {
        app.log.error({ err: error }, 'Failed to handle a device message');
        send(socket, { type: 'error', message: 'Something went wrong on the home hub.' });
      }
    }
  }

  function dispatch(message: CommandMessage): void {
    switch (message.type) {
      case 'start_mission':
        return engine.startMission(message.missionId);
      case 'step_done':
        engine.stepDone(message.runId, message.stepIndex, 'tap');
        return;
      case 'help':
        return engine.requestHelp(message.runId);
      case 'stop':
        return engine.stop(message.runId);
      case 'break':
        return engine.setBreak(message.runId, message.onBreak);
      case 'set_assistant':
        return engine.setAssistant(message.enabled);
      case 'board_say':
        return engine.boardSay(message.phraseId);
      case 'suggestion_answer':
        return engine.answerSuggestion(message.suggestionId, message.accept);
      case 'zone_enter':
        return engine.enterZone(message.zone);
      case 'zone_leave':
        return engine.leaveZone();
      case 'set_light':
        return engine.setLight(message.device, message.on);
    }
  }
}
