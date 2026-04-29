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
import { emitChirp, startListener, type ListenerHandle } from './audio/Chirp';
import type { AppMode, Band, CalibrationStep, CalibrationResult } from './types';

export type CalibrationState =
  | { phase: 'idle' }
  | { phase: 'listening'; remaining: number }
  | { phase: 'done'; rank: number | null };

export default function App() {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [roomId, setRoomId] = useState('');
  const [baseFreq, setBaseFreq] = useState(100);
  const [harmonicIndex, setHarmonicIndex] = useState<number | null>(null);
  const [totalNodes, setTotalNodes] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBand, setActiveBand] = useState<Band | null>(null);
  const [calibration, setCalibration] = useState<CalibrationState>({ phase: 'idle' });

  const { socket, status } = useSocket();
  const nodeEngine = useRef<HarmonicEngine | null>(null);
  const bandPlayer = useRef<BandPlayer | null>(null);
  const listener = useRef<ListenerHandle | null>(null);
  const pendingTrackUrl = useRef<string | null>(null);

  useEffect(() => {
    nodeEngine.current = new HarmonicEngine();
    bandPlayer.current = new BandPlayer();
    return () => {
      nodeEngine.current?.dispose();
      bandPlayer.current?.dispose();
      listener.current?.stop();
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

    // Host: schedule a single mic listener spanning every node's chirp window,
    // then score each window's peak amplitude as a relative-distance proxy.
    const onCalibratePlan = async (data: { steps: CalibrationStep[] }) => {
      try {
        if (!listener.current) listener.current = await startListener();
        const handle = listener.current;
        setCalibration({ phase: 'listening', remaining: data.steps.length });

        const results: CalibrationResult[] = [];
        for (const step of data.steps) {
          const waitMs = step.emitAtMs - Date.now();
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
          // Sample for the chirp duration plus a small guard band.
          const startCtx = handle.ctx.currentTime;
          await new Promise((r) => setTimeout(r, 350));
          const endCtx = handle.ctx.currentTime;
          const peak = handle.peakSince(startCtx, endCtx);
          results.push({ nodeId: step.nodeId, score: peak });
          setCalibration((prev) =>
            prev.phase === 'listening' ? { phase: 'listening', remaining: prev.remaining - 1 } : prev,
          );
        }
        socket.emit('calibrate:results', { roomId, results });
      } catch (e) {
        setError(`calibration: ${(e as Error).message}`);
        setCalibration({ phase: 'idle' });
      }
    };

    // Node: scheduled chirp emission.
    const onCalibrateEmit = (data: { atMs: number }) => {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      void ctx.resume();
      const delaySec = Math.max(0, (data.atMs - Date.now()) / 1000);
      emitChirp(ctx, ctx.currentTime + delaySec);
      setTimeout(() => void ctx.close(), (delaySec + 0.5) * 1000);
    };

    const onCalibrateDone = (data: { ranking: { nodeId: string; rank: number }[] }) => {
      const me = data.ranking.find((r) => r.nodeId === socket.id);
      setCalibration({ phase: 'done', rank: me ? me.rank : null });
      // Stop the host listener now that we have the result.
      listener.current?.stop();
      listener.current = null;
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
    socket.on('calibrate:plan', onCalibratePlan);
    socket.on('calibrate:emit', onCalibrateEmit);
    socket.on('calibrate:done', onCalibrateDone);
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
      socket.off('calibrate:plan', onCalibratePlan);
      socket.off('calibrate:emit', onCalibrateEmit);
      socket.off('calibrate:done', onCalibrateDone);
      socket.off('host:closed', onClosed);
      socket.off('error', onErr);
    };
  }, [socket, baseFreq, harmonicIndex, roomId]);

  const reset = () => {
    nodeEngine.current?.stop();
    bandPlayer.current?.stop();
    listener.current?.stop();
    listener.current = null;
    setMode('LANDING');
    setRoomId('');
    setHarmonicIndex(null);
    setTotalNodes(0);
    setIsPlaying(false);
    setActiveBand(null);
    setCalibration({ phase: 'idle' });
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
                calibration={calibration}
                onCalibrate={() => socket.emit('calibrate:start', { roomId })}
              />
            )}

            {mode === 'NODE' && harmonicIndex !== null && (
              <NodeView
                harmonicIndex={harmonicIndex}
                baseFreq={baseFreq}
                isPlaying={isPlaying}
                band={activeBand}
                calibration={calibration}
              />
            )}

            {mode === 'SOLO' && <SoloView />}
          </AnimatePresence>
        </main>

        <footer className="mt-12 h-12 border-t border-gray-200 flex items-center justify-between text-[10px] font-bold text-gray-300 uppercase tracking-widest">
          <div>System v1.7.0_PHY</div>
          <div className="hidden sm:block">© Phantomatic Lab</div>
        </footer>
      </div>
    </div>
  );
}
