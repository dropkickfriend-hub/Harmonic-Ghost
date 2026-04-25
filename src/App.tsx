/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radio, 
  Settings2, 
  Power, 
  Smartphone, 
  Activity, 
  Waves,
  Zap,
  RotateCcw,
  Volume2,
  Users
} from 'lucide-react';

// --- Types ---
type AppMode = 'LANDING' | 'HOST' | 'NODE';

interface ServerToClientEvents {
  "host:created": (data: { roomId: string }) => void;
  "node:assigned": (data: { harmonicIndex: number; baseFreq: number }) => void;
  "host:nodeJoined": (data: { totalNodes: number; nodeId: string }) => void;
  "host:nodeLeft": (data: { totalNodes: number }) => void;
  "audio:command": (data: { type: 'start' | 'stop'; startTime: number }) => void;
  "frequency:updated": (data: { baseFreq: number }) => void;
  "host:closed": () => void;
  "error": (data: { message: string }) => void;
}

interface ClientToServerEvents {
  "host:create": (data: { baseFreq: number }) => void;
  "node:join": (data: { roomId: string }) => void;
  "audio:sync": (data: { roomId: string; state: { type: 'start' | 'stop' } }) => void;
  "frequency:change": (data: { roomId: string; baseFreq: number }) => void;
}

const SOCKET_URL = window.location.origin;

export default function App() {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [roomId, setRoomId] = useState('');
  const [baseFreq, setBaseFreq] = useState(100);
  const [harmonicIndex, setHarmonicIndex] = useState<number | null>(null);
  const [totalNodes, setTotalNodes] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio refs
  const audioContext = useRef<AudioContext | null>(null);
  const oscillator = useRef<OscillatorNode | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      stopAudio();
      stopLiveCapture();
    };
  }, []);

  // --- Pitch Detection Logic ---
  const autoCorrelate = (buf: Float32Array, sampleRate: number) => {
    let size = buf.length;
    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.01) return -1; // Too quiet

    let r1 = 0, r2 = size - 1, thres = 0.2;
    for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }

    buf = buf.slice(r1, r2);
    size = buf.length;
    let c = new Array(size).fill(0);
    for (let i = 0; i < size; i++)
      for (let j = 0; j < size - i; j++)
        c[i] = c[i] + buf[j] * buf[j + i];

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < size; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }
    let T0 = maxpos;
    return sampleRate / T0;
  };

  const startLiveCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.current = stream;
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const source = audioContext.current.createMediaStreamSource(stream);
      analyser.current = audioContext.current.createAnalyser();
      analyser.current.fftSize = 2048;
      source.connect(analyser.current);
      setIsLive(true);

      const buffer = new Float32Array(analyser.current.fftSize);
      const updatePitch = () => {
        if (!analyser.current) return;
        analyser.current.getFloatTimeDomainData(buffer);
        const pitch = autoCorrelate(buffer, audioContext.current!.sampleRate);
        if (pitch > 40 && pitch < 1000) {
          // Clamp to a useful bass/mid fundamental range for the illusion
          const clampedPitch = Math.round(pitch);
          if (Math.abs(clampedPitch - baseFreq) > 2) {
            updateFreq(clampedPitch);
          }
        }
        animationFrame.current = requestAnimationFrame(updatePitch);
      };
      updatePitch();
    } catch (err) {
      setError("Microphone access denied. Static frequency mode only.");
    }
  };

  const stopLiveCapture = () => {
    setIsLive(false);
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    if (micStream.current) {
      micStream.current.getTracks().forEach(t => t.stop());
      micStream.current = null;
    }
  };

  const triggerStartAudio = useCallback((startTime: number, freq: number) => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (oscillator.current) {
      oscillator.current.stop();
    }

    oscillator.current = audioContext.current.createOscillator();
    gainNode.current = audioContext.current.createGain();

    oscillator.current.type = 'sine';
    oscillator.current.frequency.setValueAtTime(freq, audioContext.current.currentTime);
    
    gainNode.current.gain.setValueAtTime(0, audioContext.current.currentTime);
    gainNode.current.gain.exponentialRampToValueAtTime(0.5, audioContext.current.currentTime + 0.1);
    
    oscillator.current.connect(gainNode.current);
    gainNode.current.connect(audioContext.current.destination);

    // Schedule start
    const delay = Math.max(0, (startTime - Date.now()) / 1000);
    oscillator.current.start(audioContext.current.currentTime + delay);
    setIsPlaying(true);
  }, []);

  const stopAudio = useCallback(() => {
    if (gainNode.current && audioContext.current) {
      gainNode.current.gain.exponentialRampToValueAtTime(0.0001, audioContext.current.currentTime + 0.1);
      setTimeout(() => {
        oscillator.current?.stop();
        oscillator.current = null;
      }, 100);
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on("host:created", (data) => {
      setRoomId(data.roomId);
      setMode('HOST');
    });

    socket.on("node:assigned", (data) => {
      setHarmonicIndex(data.harmonicIndex);
      setBaseFreq(data.baseFreq);
      setMode('NODE');
    });

    socket.on("host:nodeJoined", (data) => {
      setTotalNodes(data.totalNodes);
    });

    socket.on("host:nodeLeft", (data) => {
      setTotalNodes(data.totalNodes);
    });

    socket.on("audio:command", (data) => {
      if (data.type === 'start') {
        const freqToPlay = harmonicIndex ? baseFreq * harmonicIndex : baseFreq;
        triggerStartAudio(data.startTime, freqToPlay);
      } else {
        stopAudio();
      }
    });

    socket.on("frequency:updated", (data) => {
      setBaseFreq(data.baseFreq);
      if (oscillator.current && audioContext.current) {
        const freq = harmonicIndex ? data.baseFreq * harmonicIndex : data.baseFreq;
        oscillator.current.frequency.exponentialRampToValueAtTime(freq, audioContext.current.currentTime + 0.1);
      }
    });

    socket.on("host:closed", () => {
      reset();
      setError("Host has ended the session.");
    });

    socket.on("error", (data) => {
      setError(data.message);
    });

    return () => {
      socket.off("host:created");
      socket.off("node:assigned");
      socket.off("host:nodeJoined");
      socket.off("host:nodeLeft");
      socket.off("audio:command");
      socket.off("frequency:updated");
      socket.off("host:closed");
      socket.off("error");
    };
  }, [socket, harmonicIndex, baseFreq, triggerStartAudio, stopAudio]);

  const createRoom = () => {
    socket?.emit("host:create", { baseFreq });
  };

  const joinRoom = (id: string) => {
    socket?.emit("node:join", { roomId: id.toUpperCase() });
  };

  const syncToggle = () => {
    const nextState = isPlaying ? 'stop' : 'start';
    socket?.emit("audio:sync", { roomId, state: { type: nextState } });
  };

  const updateFreq = (val: number) => {
    setBaseFreq(val);
    socket?.emit("frequency:change", { roomId, baseFreq: val });
  };

  const reset = () => {
    setMode('LANDING');
    setRoomId('');
    setHarmonicIndex(null);
    setTotalNodes(0);
    stopAudio();
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1B] font-sans selection:bg-black/5">
      <div className="max-w-md mx-auto min-h-screen flex flex-col p-6 lg:max-w-none lg:px-20 lg:py-10">
        
        {/* Header */}
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
                <div>Room: <span className="text-black">{roomId}</span></div>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${socket ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  {socket ? 'Connected' : 'Offline'}
                </div>
              </div>
            )}
            {mode !== 'LANDING' && (
              <button 
                onClick={reset}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-black"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            
            {/* Landing UI */}
            {mode === 'LANDING' && (
              <motion.div 
                key="landing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full max-w-sm space-y-12"
              >
                <div className="space-y-3 text-center">
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">Audio Synthesis Environment</span>
                  <h2 className="text-4xl font-light text-black tracking-tight">Project Phantom</h2>
                  <div className="w-12 h-0.5 bg-black mx-auto"></div>
                </div>

                <div className="grid gap-4">
                  <button 
                    onClick={createRoom}
                    className="w-full h-20 bg-white border border-gray-200 rounded-xl flex items-center gap-5 px-6 hover:border-black hover:shadow-sm transition-all group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors">
                      <Radio className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm">Initialize Master</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">Create Control Room</div>
                    </div>
                  </button>

                  <div className="py-4 flex items-center gap-4 text-gray-200">
                    <div className="flex-1 h-[1px] bg-gray-200"></div>
                    <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Network Entry</span>
                    <div className="flex-1 h-[1px] bg-gray-200"></div>
                  </div>

                  <div className="space-y-4">
                    <input 
                      type="text" 
                      placeholder="HEX-CODE"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      className="w-full h-14 bg-white border border-gray-200 rounded-xl px-6 text-center font-mono text-lg tracking-[0.3em] focus:outline-none focus:border-black transition-all uppercase placeholder:text-gray-200"
                    />
                    <button 
                       disabled={!roomId}
                       onClick={() => joinRoom(roomId)}
                       className="w-full h-14 bg-black text-white text-[11px] font-bold uppercase tracking-widest rounded-xl hover:bg-gray-800 disabled:opacity-30 transition-all"
                    >
                      Establish Link
                    </button>
                  </div>
                </div>

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
            )}

            {/* Host View */}
            {mode === 'HOST' && (
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
                        onClick={isLive ? stopLiveCapture : startLiveCapture}
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
                      min="40"
                      max="400"
                      step="1"
                      value={baseFreq}
                      onChange={(e) => updateFreq(Number(e.target.value))}
                      disabled={isLive}
                      className={`w-full h-1 rounded-full appearance-none cursor-pointer transition-opacity ${isLive ? 'opacity-30' : 'opacity-100'}`}
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white border border-gray-200 p-6 rounded-2xl flex flex-col gap-1">
                         <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Network Nodes</span>
                         <span className="text-3xl font-light text-black">0{totalNodes}</span>
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
                     <div className="w- identity w-32 h-32 rounded-full border border-gray-100 flex items-center justify-center">
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
                        isPlaying 
                          ? 'bg-gray-100 text-black border border-gray-200' 
                          : 'bg-black text-white hover:bg-gray-800'
                      }`}
                    >
                      {isPlaying ? 'Disable Signal' : 'Initiate Broadcast'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Node View */}
            {mode === 'NODE' && (
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
                     <div className={`absolute inset-0 border border-gray-100 rounded-full transition-transform duration-1000 ${isPlaying ? 'scale-125' : 'scale-100'}`} />
                     <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
                       isPlaying ? 'bg-black text-white' : 'bg-gray-50 text-gray-300'
                     }`}>
                       <Waves className={`w-10 h-10 ${isPlaying ? 'animate-pulse' : ''}`} />
                     </div>
                  </div>

                  <div className="text-center space-y-4">
                    <div className="font-mono text-2xl tracking-tighter">
                      {baseFreq * (harmonicIndex || 1)}<span className="text-sm text-gray-300 ml-1">Hz</span>
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
                  Position device in physical vicinity <br/> to enhance psychoacoustic reconstruction
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="mt-12 h-12 border-t border-gray-200 flex items-center justify-between text-[10px] font-bold text-gray-300 uppercase tracking-widest">
           <div>System v1.4.0_PHY</div>
           <div className="hidden sm:block">© Phantomatic Lab</div>
        </footer>

      </div>
    </div>
  );
}
