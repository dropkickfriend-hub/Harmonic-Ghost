import { motion } from 'motion/react';
import { Radio, Waves } from 'lucide-react';

interface Props {
  roomId: string;
  setRoomId: (v: string) => void;
  onCreate: () => void;
  onJoin: (id: string) => void;
  onSolo: () => void;
  serverAvailable: boolean;
  error: string | null;
}

export function Landing({ roomId, setRoomId, onCreate, onJoin, onSolo, serverAvailable, error }: Props) {
  return (
    <motion.div
      key="landing"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full max-w-sm space-y-12"
    >
      <div className="space-y-3 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
          Audio Synthesis Environment
        </span>
        <h2 className="text-4xl font-light text-black tracking-tight">Project Phantom</h2>
        <div className="w-12 h-0.5 bg-black mx-auto" />
      </div>

      <div className="grid gap-4">
        <button
          onClick={onSolo}
          className="w-full h-20 bg-white border border-gray-200 rounded-xl flex items-center gap-5 px-6 hover:border-black hover:shadow-sm transition-all group"
        >
          <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors">
            <Waves className="w-6 h-6" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-sm">Solo Mode</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">
              Stereo Harmonic Stack · Single Device
            </div>
          </div>
        </button>

        <button
          onClick={onCreate}
          disabled={!serverAvailable}
          className="w-full h-20 bg-white border border-gray-200 rounded-xl flex items-center gap-5 px-6 hover:border-black hover:shadow-sm transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors">
            <Radio className="w-6 h-6" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-sm">Initialize Master</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">
              {serverAvailable ? 'Create Control Room' : 'Server Unavailable'}
            </div>
          </div>
        </button>

        <div className="py-4 flex items-center gap-4 text-gray-200">
          <div className="flex-1 h-[1px] bg-gray-200" />
          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Network Entry</span>
          <div className="flex-1 h-[1px] bg-gray-200" />
        </div>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="HEX-CODE"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            disabled={!serverAvailable}
            className="w-full h-14 bg-white border border-gray-200 rounded-xl px-6 text-center font-mono text-lg tracking-[0.3em] focus:outline-none focus:border-black transition-all uppercase placeholder:text-gray-200 disabled:opacity-40"
          />
          <button
            disabled={!roomId || !serverAvailable}
            onClick={() => onJoin(roomId)}
            className="w-full h-14 bg-black text-white text-[11px] font-bold uppercase tracking-widest rounded-xl hover:bg-gray-800 disabled:opacity-30 transition-all"
          >
            Establish Link
          </button>
        </div>
      </div>

      {!serverAvailable && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 text-[10px] font-bold uppercase tracking-widest text-center leading-relaxed">
          Sync server offline · Solo mode available
        </div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 bg-gray-50 border border-red-200 rounded-lg text-red-500 text-[11px] font-bold uppercase tracking-wider text-center"
        >
          {error}
        </motion.div>
      )}
    </motion.div>
  );
}
