export type AppMode = 'LANDING' | 'HOST' | 'NODE' | 'SOLO';

export interface Band {
  lo: number;
  hi: number;
  index: number;
  total: number;
}

export interface CalibrationStep {
  nodeId: string;
  emitAtMs: number; // wall-clock ms (Date.now-aligned) when this node should chirp
}

export interface CalibrationResult {
  nodeId: string;
  score: number; // higher = closer to host
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
  'calibrate:plan': (data: { steps: CalibrationStep[] }) => void;
  'calibrate:emit': (data: { atMs: number }) => void;
  'calibrate:done': (data: { ranking: { nodeId: string; rank: number }[] }) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'host:create': (data: { baseFreq: number }) => void;
  'host:trackUploaded': (data: { roomId: string }) => void;
  'node:join': (data: { roomId: string }) => void;
  'audio:sync': (data: { roomId: string; state: { type: 'start' | 'stop' } }) => void;
  'frequency:change': (data: { roomId: string; baseFreq: number }) => void;
  'calibrate:start': (data: { roomId: string }) => void;
  'calibrate:results': (data: { roomId: string; results: CalibrationResult[] }) => void;
}
