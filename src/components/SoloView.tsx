import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity } from 'lucide-react';
import { HarmonicEngine, defaultStack } from '../audio/HarmonicEngine';
import { startPitchDetector, type PitchDetectorHandle } from '../audio/PitchDetector';

export function SoloView() {
  const [baseFreq, setBaseFreq] = useState(80);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [stack, setStack] = useState<number[]>(defaultStack);
  const [error, setError] = useState<string | null>(null);

  const engine = useRef<HarmonicEngine | null>(null);
  const pitch = useRef<PitchDetectorHandle | null>(null);

  useEffect(() => {
    engine.current = new HarmonicEngine();
    return () => {
      engine.current?.dispose();
      pitch.current?.stop();
    };
  }, []);

  const toggle = () => {
    if (!engine.current) return;
    if (isPlaying) {
      engine.current.stop();
      setIsPlaying(false);
    } else {
      engine.current.start({ fundamental: baseFreq, harmonics: stack });
      setIsPlaying(true);
    }
  };

  const updateFreq = (v: number) => {
    setBaseFreq(v);
    engine.current?.setFundamental(v, stack);
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
      setError('Microphone access denied.');
    }
  };

  const toggleHarmonic = (h: number) => {
    setStack((prev) => {
      const next = prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h].sort((a, b) => a - b);
      if (next.length === 0) return prev;
      if (engine.current?.isPlaying()) {
        engine.current.stop(0.05);
        setTimeout(() => engine.current?.start({ fundamental: baseFreq, harmonics: next }), 80);
      }
      return next;
    });
  };

  return (
    <motion.div
      key="solo"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-2xl lg:grid lg:grid-cols-2 lg:gap-16 items-center"
    >
      <div className="space-y-12">
        <div className="space-y-4">
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Phantom Fundamental</span>
          <div className="flex items-baseline gap-4">
            <h2 className="text-8xl font-light tracking-tighter text-black">{baseFreq}</h2>
            <span className="text-2xl text-gray-300 font-light">Hz</span>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed max-w-xs">
            Stack of harmonics 2f–7f spread across stereo. Your ear reconstructs the fundamental even though it's never
            played.
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
            min={30}
            max={250}
            step={1}
            value={baseFreq}
            onChange={(e) => updateFreq(Number(e.target.value))}
            disabled={isLive}
            className={`w-full h-1 rounded-full appearance-none cursor-pointer transition-opacity ${
              isLive ? 'opacity-30' : 'opacity-100'
            }`}
          />

          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 block">
              Active Harmonics
            </span>
            <div className="flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6, 7, 8, 9].map((h) => (
                <button
                  key={h}
                  onClick={() => toggleHarmonic(h)}
                  className={`w-10 h-10 rounded-lg text-xs font-mono font-bold transition-all ${
                    stack.includes(h)
                      ? 'bg-black text-white'
                      : 'bg-white border border-gray-200 text-gray-300 hover:text-black'
                  }`}
                >
                  {h}f
                </button>
              ))}
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
            onClick={toggle}
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
