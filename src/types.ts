export type AppMode = 'LANDING' | 'HOST' | 'NODE' | 'SOLO';

export interface ServerToClientEvents {
  'host:created': (data: { roomId: string }) => void;
  'node:assigned': (data: { harmonicIndex: number; baseFreq: number }) => void;
  'host:nodeJoined': (data: { totalNodes: number; nodeId: string }) => void;
  'host:nodeLeft': (data: { totalNodes: number }) => void;
  'audio:command': (data: { type: 'start' | 'stop'; startTime: number }) => void;
  'frequency:updated': (data: { baseFreq: number }) => void;
  'host:closed': () => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'host:create': (data: { baseFreq: number }) => void;
  'node:join': (data: { roomId: string }) => void;
  'audio:sync': (data: { roomId: string; state: { type: 'start' | 'stop' } }) => void;
  'frequency:change': (data: { roomId: string; baseFreq: number }) => void;
}
