import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { HostView } from './components/HostView';
import { NodeView } from './components/NodeView';
import { SoloView } from './components/SoloView';
import { useSocket } from './socket/useSocket';
import { HarmonicEngine } from './audio/HarmonicEngine';
import type { AppMode } from './types';

export default function App() {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [roomId, setRoomId] = useState('');
  const [baseFreq, setBaseFreq] = useState(100);
  const [harmonicIndex, setHarmonicIndex] = useState<number | null>(null);
  const [totalNodes, setTotalNodes] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { socket, status } = useSocket();
  const nodeEngine = useRef<HarmonicEngine | null>(null);

  useEffect(() => {
    nodeEngine.current = new HarmonicEngine();
    return () => nodeEngine.current?.dispose();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onCreated = (data: { roomId: string }) => {
      setRoomId(data.roomId);
      setMode('HOST');
    };
    const onAssigned = (data: { harmonicIndex: number; baseFreq: number }) => {
      setHarmonicIndex(data.harmonicIndex);
      setBaseFreq(data.baseFreq);
      setMode('NODE');
    };
    const onJoined = (data: { totalNodes: number }) => setTotalNodes(data.totalNodes);
    const onLeft = (data: { totalNodes: number }) => setTotalNodes(data.totalNodes);

    const onCommand = (data: { type: 'start' | 'stop'; startTime: number }) => {
      const delaySec = Math.max(0, (data.startTime - Date.now()) / 1000);
      if (data.type === 'start') {
        // Host stays silent so the fundamental is genuinely missing; only
        // nodes carry harmonics. harmonicIndex is null in HOST mode.
        if (harmonicIndex !== null) {
          nodeEngine.current?.start({ fundamental: baseFreq, harmonics: [harmonicIndex] }, delaySec);
        }
        setIsPlaying(true);
      } else {
        nodeEngine.current?.stop();
        setIsPlaying(false);
      }
    };

    const onFreq = (data: { baseFreq: number }) => {
      setBaseFreq(data.baseFreq);
      const h = harmonicIndex ?? 1;
      nodeEngine.current?.setFundamental(data.baseFreq, [h]);
    };

    const onClosed = () => {
      reset();
      setError('Host has ended the session.');
    };
    const onErr = (data: { message: string }) => setError(data.message);

    socket.on('host:created', onCreated);
    socket.on('node:assigned', onAssigned);
    socket.on('host:nodeJoined', onJoined);
    socket.on('host:nodeLeft', onLeft);
    socket.on('audio:command', onCommand);
    socket.on('frequency:updated', onFreq);
    socket.on('host:closed', onClosed);
    socket.on('error', onErr);

    return () => {
      socket.off('host:created', onCreated);
      socket.off('node:assigned', onAssigned);
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
    setMode('LANDING');
    setRoomId('');
    setHarmonicIndex(null);
    setTotalNodes(0);
    setIsPlaying(false);
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
              <NodeView harmonicIndex={harmonicIndex} baseFreq={baseFreq} isPlaying={isPlaying} />
            )}

            {mode === 'SOLO' && <SoloView />}
          </AnimatePresence>
        </main>

        <footer className="mt-12 h-12 border-t border-gray-200 flex items-center justify-between text-[10px] font-bold text-gray-300 uppercase tracking-widest">
          <div>System v1.5.0_PHY</div>
          <div className="hidden sm:block">© Phantomatic Lab</div>
        </footer>
      </div>
    </div>
  );
}
