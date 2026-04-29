import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { HostView } from './components/HostView';
import { NodeView } from './components/NodeView';
import { SoloView } from './components/SoloView';
import { useSocket } from './socket/useSocket';
import { HarmonicEngine } from './audio/HarmonicEngine';
import { BandPlayer } from './audio/BandPlayer';
import type { AppMode, Band } from './types';

export default function App() {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [roomId, setRoomId] = useState('');
  const [baseFreq, setBaseFreq] = useState(100);
  const [harmonicIndex, setHarmonicIndex] = useState<number | null>(null);
  const [totalNodes, setTotalNodes] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBand, setActiveBand] = useState<Band | null>(null);

  const { socket, status } = useSocket();
  const nodeEngine = useRef<HarmonicEngine | null>(null);
  const bandPlayer = useRef<BandPlayer | null>(null);
  const pendingTrackUrl = useRef<string | null>(null);

  useEffect(() => {
    nodeEngine.current = new HarmonicEngine();
    bandPlayer.current = new BandPlayer();
    return () => {
      nodeEngine.current?.dispose();
      bandPlayer.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onCreated = (data: { roomId: string }) => {
      setRoomId(data.roomId);
      setMode('HOST');
    };

    const onAssigned = (data: { harmonicIndex: number; baseFreq: number; trackUrl?: string }) => {
      setHarmonicIndex(data.harmonicIndex);
      setBaseFreq(data.baseFreq);
      setMode('NODE');
      if (data.trackUrl) {
        pendingTrackUrl.current = data.trackUrl;
        bandPlayer.current?.preload(data.trackUrl).catch((e) => setError(`prefetch: ${e.message}`));
      }
    };

    const onTrackReady = (data: { trackUrl: string }) => {
      pendingTrackUrl.current = data.trackUrl;
      bandPlayer.current?.preload(data.trackUrl).catch((e) => setError(`prefetch: ${e.message}`));
    };

    const onJoined = (data: { totalNodes: number }) => setTotalNodes(data.totalNodes);
    const onLeft = (data: { totalNodes: number }) => setTotalNodes(data.totalNodes);

    const onCommand = async (data: {
      type: 'start' | 'stop';
      startTime: number;
      trackUrl?: string;
      band?: Band;
    }) => {
      if (data.type === 'stop') {
        nodeEngine.current?.stop();
        bandPlayer.current?.stop();
        setIsPlaying(false);
        return;
      }

      // Band-split mode: play our slice of the host's track.
      if (data.band && data.trackUrl) {
        try {
          if (!bandPlayer.current?.isLoaded(data.trackUrl)) {
            await bandPlayer.current?.preload(data.trackUrl);
          }
          bandPlayer.current?.start(data.band, data.startTime);
          setActiveBand(data.band);
          setIsPlaying(true);
        } catch (e) {
          setError(`playback: ${(e as Error).message}`);
        }
        return;
      }

      // Harmonic-stack fallback: each node plays its assigned harmonic.
      if (harmonicIndex !== null) {
        const delaySec = Math.max(0, (data.startTime - Date.now()) / 1000);
        nodeEngine.current?.start({ fundamental: baseFreq, harmonics: [harmonicIndex] }, delaySec);
      }
      setIsPlaying(true);
    };

    const onFreq = (data: { baseFreq: number }) => {
      setBaseFreq(data.baseFreq);
      if (harmonicIndex !== null) {
        nodeEngine.current?.setFundamental(data.baseFreq, [harmonicIndex]);
      }
    };

    const onClosed = () => {
      reset();
      setError('Host has ended the session.');
    };
    const onErr = (data: { message: string }) => setError(data.message);

    socket.on('host:created', onCreated);
    socket.on('node:assigned', onAssigned);
    socket.on('host:trackReady', onTrackReady);
    socket.on('host:nodeJoined', onJoined);
    socket.on('host:nodeLeft', onLeft);
    socket.on('audio:command', onCommand);
    socket.on('frequency:updated', onFreq);
    socket.on('host:closed', onClosed);
    socket.on('error', onErr);

    return () => {
      socket.off('host:created', onCreated);
      socket.off('node:assigned', onAssigned);
      socket.off('host:trackReady', onTrackReady);
      socket.off('host:nodeJoined', onJoined);
      socket.off('host:nodeLeft', onLeft);
      socket.off('audio:command', onCommand);
      socket.off('frequency:updated', onFreq);
      socket.off('host:closed', onClosed);
      socket.off('error', onErr);
    };
  }, [socket, baseFreq, harmonicIndex]);

  const reset = () => {
    nodeEngine.current?.stop();
    bandPlayer.current?.stop();
    setMode('LANDING');
    setRoomId('');
    setHarmonicIndex(null);
    setTotalNodes(0);
    setIsPlaying(false);
    setActiveBand(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1B] font-sans selection:bg-black/5">
      <div className="max-w-md mx-auto min-h-screen flex flex-col p-6 lg:max-w-none lg:px-20 lg:py-10">
        <Header
          mode={mode}
          roomId={roomId}
          connected={status === 'connected' || mode === 'SOLO'}
          onReset={reset}
        />

        <main className="flex-1 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            {mode === 'LANDING' && (
              <Landing
                roomId={roomId}
                setRoomId={setRoomId}
                onCreate={() => socket?.emit('host:create', { baseFreq })}
                onJoin={(id) => socket?.emit('node:join', { roomId: id.toUpperCase() })}
                onSolo={() => setMode('SOLO')}
                serverAvailable={status === 'connected'}
                error={error}
              />
            )}

            {mode === 'HOST' && socket && (
              <HostView
                socket={socket}
                roomId={roomId}
                baseFreq={baseFreq}
                totalNodes={totalNodes}
                isPlaying={isPlaying}
                setBaseFreq={setBaseFreq}
              />
            )}

            {mode === 'NODE' && harmonicIndex !== null && (
              <NodeView
                harmonicIndex={harmonicIndex}
                baseFreq={baseFreq}
                isPlaying={isPlaying}
                band={activeBand}
              />
            )}

            {mode === 'SOLO' && <SoloView />}
          </AnimatePresence>
        </main>

        <footer className="mt-12 h-12 border-t border-gray-200 flex items-center justify-between text-[10px] font-bold text-gray-300 uppercase tracking-widest">
          <div>System v1.6.0_PHY</div>
          <div className="hidden sm:block">© Phantomatic Lab</div>
        </footer>
      </div>
    </div>
  );
}
