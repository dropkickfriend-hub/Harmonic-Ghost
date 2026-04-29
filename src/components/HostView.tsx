import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity } from 'lucide-react';
import type { GhostSocket } from '../socket/useSocket';
import { startPitchDetector, type PitchDetectorHandle } from '../audio/PitchDetector';

interface Props {
  socket: GhostSocket;
  roomId: string;
  baseFreq: number;
  totalNodes: number;
  isPlaying: boolean;
  setBaseFreq: (v: number) => void;
}

export function HostView({ socket, roomId, baseFreq, totalNodes, isPlaying, setBaseFreq }: Props) {
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pitch = useRef<PitchDetectorHandle | null>(null);

  useEffect(() => () => pitch.current?.stop(), []);

  const updateFreq = (val: number) => {
    setBaseFreq(val);
    socket.emit('frequency:change', { roomId, baseFreq: val });
  };

  const syncToggle = () => {
    socket.emit('audio:sync', { roomId, state: { type: isPlaying ? 'stop' : 'start' } });
  };

  const toggleLive = async () => {
    if (isLive) {
      pitch.current?.stop();
      pitch.current = null;
      setIsLive(false);
      return;
    }
    try {
      pitch.current = await startPitchDetector({
        onPitch: (hz) => {
          if (Math.abs(hz - baseFreq) > 2) updateFreq(hz);
        },
      });
      setIsLive(true);
    } catch {
      setError('Microphone access denied. Static frequency mode only.');
    }
  };

  return (
    <motion.div
      key="host"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-2xl lg:grid lg:grid-cols-2 lg:gap-16 items-center"
    >
      <div className="space-y-12">
        <div className="space-y-4">
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Target Frequency</span>
          <div className="flex items-baseline gap-4">
            <h2 className="text-8xl font-light tracking-tighter text-black">{baseFreq}</h2>
            <span className="text-2xl text-gray-300 font-light">Hz</span>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed max-w-xs">
            Synchronized fundamental frequency distributed across the phantom mesh network.
          </p>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={toggleLive}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                isLive ? 'bg-orange-500 text-white animate-pulse' : 'bg-gray-100 text-gray-400 hover:text-black'
              }`}
            >
              {isLive ? 'Live Sync Active' : 'Enable Live Capture'}
            </button>
            <span className="text-[10px] font-mono text-gray-400">{isLive ? 'Detecting...' : 'Manual Mode'}</span>
          </div>

          <input
            type="range"
            min={40}
            max={400}
            step={1}
            value={baseFreq}
            onChange={(e) => updateFreq(Number(e.target.value))}
            disabled={isLive}
            className={`w-full h-1 rounded-full appearance-none cursor-pointer transition-opacity ${
              isLive ? 'opacity-30' : 'opacity-100'
            }`}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 p-6 rounded-2xl flex flex-col gap-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Network Nodes</span>
              <span className="text-3xl font-light text-black">{String(totalNodes).padStart(2, '0')}</span>
            </div>
            <div className="bg-white border border-gray-200 p-6 rounded-2xl flex flex-col gap-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Sync Quality</span>
              <span className="text-3xl font-light text-emerald-500">Opt</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12 lg:mt-0 flex flex-col gap-4">
        <div className="bg-white border border-gray-200 p-8 rounded-3xl flex flex-col items-center gap-8">
          <div className="relative w-32 h-32 rounded-full border border-gray-100 flex items-center justify-center">
            <AnimatePresence>
              {isPlaying && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute w-32 h-32 rounded-full border border-gray-200"
                />
              )}
            </AnimatePresence>
            <Activity className={`w-8 h-8 transition-colors ${isPlaying ? 'text-black' : 'text-gray-200'}`} />
          </div>

          <button
            onClick={syncToggle}
            className={`w-full py-5 text-xs font-bold uppercase tracking-[0.2em] rounded-xl transition-all ${
              isPlaying ? 'bg-gray-100 text-black border border-gray-200' : 'bg-black text-white hover:bg-gray-800'
            }`}
          >
            {isPlaying ? 'Disable Signal' : 'Initiate Broadcast'}
          </button>
        </div>
        {error && (
          <div className="p-4 bg-gray-50 border border-red-200 rounded-lg text-red-500 text-[11px] font-bold uppercase tracking-wider text-center">
            {error}
          </div>
        )}
      </div>
    </motion.div>
  );
}
