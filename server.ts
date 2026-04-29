import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Room {
  hostId: string;
  baseFreq: number;
  nodes: string[];
  track?: { buffer: Buffer; mime: string };
  // Ranking is the node order from closest-to-host (rank 0) to farthest. Used
  // to assign bands so widely-spaced phones get lower bands (fundamental
  // reconstruction works best across distance) and clustered phones get
  // highs (where directional cues matter more).
  ranking?: string[];
}

// Logarithmic band split. Drops content below `lo` so the fundamental is
// missing — perceived bass comes from the brain reconstructing it from the
// harmonics distributed across nodes.
function logBands(n: number, lo = 80, hi = 12000) {
  if (n <= 0) return [];
  const ratio = Math.pow(hi / lo, 1 / n);
  return Array.from({ length: n }, (_, i) => ({
    lo: Math.round(lo * Math.pow(ratio, i)),
    hi: Math.round(lo * Math.pow(ratio, i + 1)),
    index: i,
    total: n,
  }));
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const corsOrigin = allowedOrigins.includes('*') ? '*' : allowedOrigins;

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (corsOrigin === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const io = new Server(httpServer, {
    cors: { origin: corsOrigin },
    maxHttpBufferSize: 25 * 1024 * 1024,
  });

  const PORT = Number(process.env.PORT) || 3000;
  const rooms: Record<string, Room> = {};

  // Track upload (host) — accepts raw audio bytes for a room.
  app.post(
    '/api/track/:roomId',
    express.raw({ type: 'audio/*', limit: '50mb' }),
    (req, res) => {
      const room = rooms[req.params.roomId];
      if (!room) return res.status(404).json({ error: 'room not found' });
      const mime = req.headers['content-type'] || 'audio/mpeg';
      room.track = { buffer: req.body as Buffer, mime: String(mime) };
      io.to(req.params.roomId).emit('host:trackReady', {
        trackUrl: `/api/track/${req.params.roomId}`,
      });
      res.json({ ok: true, size: room.track.buffer.length });
    },
  );

  // Track download (nodes).
  app.get('/api/track/:roomId', (req, res) => {
    const room = rooms[req.params.roomId];
    if (!room?.track) return res.status(404).json({ error: 'no track' });
    res.setHeader('Content-Type', room.track.mime);
    res.setHeader('Cache-Control', 'no-store');
    res.send(room.track.buffer);
  });

  // Render endpoint for external repos (DILLA / BANDxMATE) — returns a JSON
  // band assignment plan for a given fundamental and node count. Audio
  // synthesis still happens client-side; this just hands out the math.
  app.get('/api/plan', (req, res) => {
    const fundamental = Number(req.query.f) || 80;
    const nodes = Math.max(1, Math.min(16, Number(req.query.n) || 4));
    res.json({
      fundamental,
      harmonics: Array.from({ length: nodes }, (_, i) => i + 2),
      bands: logBands(nodes),
    });
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('host:create', (payload) => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      rooms[roomId] = {
        hostId: socket.id,
        baseFreq: payload.baseFreq || 100,
        nodes: [],
      };
      socket.join(roomId);
      socket.emit('host:created', { roomId });
      console.log(`Room ${roomId} created by ${socket.id}`);
    });

    socket.on('node:join', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return socket.emit('error', { message: 'Room not found' });
      socket.join(roomId);
      const harmonicIndex = room.nodes.length + 2;
      room.nodes.push(socket.id);

      socket.emit('node:assigned', {
        harmonicIndex,
        baseFreq: room.baseFreq,
        trackUrl: room.track ? `/api/track/${roomId}` : undefined,
      });
      io.to(room.hostId).emit('host:nodeJoined', {
        totalNodes: room.nodes.length,
        nodeId: socket.id,
      });
      console.log(`Node ${socket.id} joined ${roomId} as harmonic ${harmonicIndex}`);
    });

    socket.on('audio:sync', ({ roomId, state }) => {
      const room = rooms[roomId];
      if (!room) return;
      // ~1s buffer so all nodes have decoded the track and can align starts.
      const startTime = Date.now() + 1000;

      if (state.type === 'stop') {
        io.to(roomId).emit('audio:command', { type: 'stop', startTime });
        return;
      }

      if (room.track && room.nodes.length > 0) {
        const bands = logBands(room.nodes.length);
        const trackUrl = `/api/track/${roomId}`;
        // Order nodes by ranking if calibrated. Lowest band (index 0) goes to
        // the farthest node so spatially-spread phones reconstruct the bass.
        const ordered = room.ranking
          ? [...room.ranking].reverse().filter((id) => room.nodes.includes(id))
          : room.nodes;
        // Append any nodes not present in the ranking (e.g. joined post-calibration).
        room.nodes.forEach((id) => {
          if (!ordered.includes(id)) ordered.push(id);
        });
        ordered.forEach((nodeId, i) => {
          io.to(nodeId).emit('audio:command', {
            type: 'start',
            startTime,
            trackUrl,
            band: bands[i],
          });
        });
      } else {
        // Harmonic-stack fallback (no track loaded): each node plays its sine.
        io.to(roomId).emit('audio:command', { type: 'start', startTime });
      }
    });

    socket.on('calibrate:start', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.hostId !== socket.id) return;
      if (room.nodes.length === 0) return;

      // Schedule each node to chirp 1.5s apart, with a 1.5s lead so the host
      // can spin up its mic listener before the first emission.
      const lead = 1500;
      const gap = 1500;
      const t0 = Date.now() + lead;
      const steps = room.nodes.map((nodeId, i) => ({
        nodeId,
        emitAtMs: t0 + i * gap,
      }));

      io.to(room.hostId).emit('calibrate:plan', { steps });
      steps.forEach((s) => {
        io.to(s.nodeId).emit('calibrate:emit', { atMs: s.emitAtMs });
      });
    });

    socket.on('calibrate:results', ({ roomId, results }) => {
      const room = rooms[roomId];
      if (!room || room.hostId !== socket.id) return;
      // Higher score = louder chirp = closer to host.
      const sorted = [...results].sort((a, b) => b.score - a.score);
      room.ranking = sorted.map((r) => r.nodeId);
      io.to(roomId).emit('calibrate:done', {
        ranking: sorted.map((r, i) => ({ nodeId: r.nodeId, rank: i })),
      });
    });

    socket.on('frequency:change', ({ roomId, baseFreq }) => {
      if (rooms[roomId]) {
        rooms[roomId].baseFreq = baseFreq;
        io.to(roomId).emit('frequency:updated', { baseFreq });
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.hostId === socket.id) {
          io.to(roomId).emit('host:closed');
          delete rooms[roomId];
        } else {
          const i = room.nodes.indexOf(socket.id);
          if (i !== -1) {
            room.nodes.splice(i, 1);
            if (room.ranking) {
              room.ranking = room.ranking.filter((id) => id !== socket.id);
            }
            io.to(room.hostId).emit('host:nodeLeft', { totalNodes: room.nodes.length });
          }
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
