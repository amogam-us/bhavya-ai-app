import type {
  ClientMessage,
  ClientRole,
  HomeState,
  Notification,
  ServerMessage,
  TraceEntry,
} from '@bhavya/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RETRY_DELAY_MS = 5000;
const ERROR_VISIBLE_MS = 5000;
const MAX_NOTIFICATIONS = 50;
const MAX_TRACES = 150;

function socketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws`;
}

export interface HomeConnection {
  state: HomeState | null;
  connected: boolean;
  notifications: Notification[];
  /** Simulator only: the brain log, newest first. */
  traces: TraceEntry[];
  /** Last error sent by the hub for this device, cleared after a few seconds. */
  error: string | null;
  send: (message: ClientMessage) => boolean;
}

/**
 * Live connection to the home hub. Reconnects with backoff and re-introduces
 * itself on every connect, so the hub always knows this device's role.
 */
export function useHome(
  role: ClientRole,
  onNotification?: (n: Notification) => void,
): HomeConnection {
  const [state, setState] = useState<HomeState | null>(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const socket = new WebSocket(socketUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        socket.send(JSON.stringify({ type: 'hello', role } satisfies ClientMessage));
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        switch (message.type) {
          case 'state':
            setState(message.state);
            break;
          case 'notifications':
            setNotifications(message.items);
            break;
          case 'notification':
            setNotifications((list) => [message.notification, ...list].slice(0, MAX_NOTIFICATIONS));
            onNotificationRef.current?.(message.notification);
            break;
          case 'traces':
            setTraces(message.items);
            break;
          case 'trace':
            setTraces((list) => [message.entry, ...list].slice(0, MAX_TRACES));
            break;
          case 'error':
            setError(message.message);
            break;
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;
        const delay = Math.min(MAX_RETRY_DELAY_MS, 500 * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [role]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [error]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      setError('Not connected to the home hub yet.');
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  return { state, connected, notifications, traces, error, send };
}
