export type AppMode = 'LANDING' | 'HOST' | 'NODE' | 'SOLO';

export interface Band {
  lo: number;
  hi: number;
  index: number;
  total: number;
}

export interface ServerToClientEvents {
  'host:created': (data: { roomId: string }) => void;
  'host:trackReady': (data: { trackUrl: string; durationHint?: number }) => void;
  'node:assigned': (data: {
    harmonicIndex: number;
    baseFreq: number;
    trackUrl?: string;
  }) => void;
  'host:nodeJoined': (data: { totalNodes: number; nodeId: string }) => void;
  'host:nodeLeft': (data: { totalNodes: number }) => void;
  'audio:command': (data: {
    type: 'start' | 'stop';
    startTime: number;
    trackUrl?: string;
    band?: Band;
  }) => void;
  'frequency:updated': (data: { baseFreq: number }) => void;
  'host:closed': () => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'host:create': (data: { baseFreq: number }) => void;
  'host:trackUploaded': (data: { roomId: string }) => void;
  'node:join': (data: { roomId: string }) => void;
  'audio:sync': (data: { roomId: string; state: { type: 'start' | 'stop' } }) => void;
  'frequency:change': (data: { roomId: string; baseFreq: number }) => void;
}
