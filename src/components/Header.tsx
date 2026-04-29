import { RotateCcw } from 'lucide-react';
import type { AppMode } from '../types';

interface Props {
  mode: AppMode;
  roomId: string;
  connected: boolean;
  onReset: () => void;
}

export function Header({ mode, roomId, connected, onReset }: Props) {
  return (
    <header className="mb-12 flex items-center justify-between pb-6 border-b border-gray-200">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-none bg-black flex items-center justify-center">
          <div className="w-1 h-4 bg-white" />
        </div>
        <h1 className="text-xl font-medium tracking-tight">AUREL SYNC</h1>
      </div>
      <div className="flex items-center gap-4">
        {mode !== 'LANDING' && (
          <div className="hidden md:flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-4">
            {roomId && (
              <div>
                Room: <span className="text-black">{roomId}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {connected ? 'Connected' : mode === 'SOLO' ? 'Standalone' : 'Offline'}
            </div>
          </div>
        )}
        {mode !== 'LANDING' && (
          <button
            onClick={onReset}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-black"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}
      </div>
    </header>
  );
}
