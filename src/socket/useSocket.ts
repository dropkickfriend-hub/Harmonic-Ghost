import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../types';

export type GhostSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SocketState {
  socket: GhostSocket | null;
  status: 'connecting' | 'connected' | 'unavailable';
}

// Probes the local socket.io server. On static hosts (e.g. GitHub Pages)
// no server exists; we report `unavailable` so the UI can offer Solo mode.
export function useSocket(timeoutMs = 2500): SocketState {
  const [socket, setSocket] = useState<GhostSocket | null>(null);
  const [status, setStatus] = useState<SocketState['status']>('connecting');

  useEffect(() => {
    const url = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const s: GhostSocket = io(url, {
      reconnectionAttempts: 2,
      timeout: timeoutMs,
      transports: ['websocket', 'polling'],
    });

    const onConnect = () => {
      setSocket(s);
      setStatus('connected');
    };
    const fail = () => setStatus('unavailable');

    s.on('connect', onConnect);
    s.on('connect_error', fail);

    const t = window.setTimeout(() => {
      if (!s.connected) {
        fail();
        s.close();
      }
    }, timeoutMs);

    return () => {
      window.clearTimeout(t);
      s.off('connect', onConnect);
      s.off('connect_error', fail);
      s.disconnect();
    };
  }, [timeoutMs]);

  return { socket, status };
}
