import { motion } from 'motion/react';
import { Waves } from 'lucide-react';

interface Props {
  harmonicIndex: number;
  baseFreq: number;
  isPlaying: boolean;
}

export function NodeView({ harmonicIndex, baseFreq, isPlaying }: Props) {
  const freq = baseFreq * harmonicIndex;
  return (
    <motion.div
      key="node"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full flex flex-col items-center max-w-sm"
    >
      <div className="w-full bg-white border border-gray-200 rounded-3xl p-10 space-y-12 flex flex-col items-center">
        <div className="text-center space-y-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Assigned Scalar</span>
          <div className="text-7xl font-light tracking-tighter">H#{harmonicIndex}</div>
        </div>

        <div className="relative w-48 h-48 flex items-center justify-center">
          <div
            className={`absolute inset-0 border border-gray-100 rounded-full transition-transform duration-1000 ${
              isPlaying ? 'scale-125' : 'scale-100'
            }`}
          />
          <div
            className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
              isPlaying ? 'bg-black text-white' : 'bg-gray-50 text-gray-300'
            }`}
          >
            <Waves className={`w-10 h-10 ${isPlaying ? 'animate-pulse' : ''}`} />
          </div>
        </div>

        <div className="text-center space-y-4">
          <div className="font-mono text-2xl tracking-tighter">
            {freq}
            <span className="text-sm text-gray-300 ml-1">Hz</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-gray-200'}`} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {isPlaying ? 'Signal Active' : 'Standby Mode'}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-8 text-[10px] text-gray-400 text-center uppercase tracking-widest leading-relaxed">
        Position device in physical vicinity <br /> to enhance psychoacoustic reconstruction
      </p>
    </motion.div>
  );
}
