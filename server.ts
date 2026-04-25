import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Store room data
  // rooms: { [roomId: string]: { hostId: string, baseFrequency: number, nodes: string[] } }
  const rooms: Record<string, { hostId: string; baseFreq: number; nodes: string[] }> = {};

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("host:create", (payload) => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      rooms[roomId] = {
        hostId: socket.id,
        baseFreq: payload.baseFreq || 100,
        nodes: [],
      };
      socket.join(roomId);
      socket.emit("host:created", { roomId });
      console.log(`Room ${roomId} created by ${socket.id}`);
    });

    socket.on("node:join", ({ roomId }) => {
      if (rooms[roomId]) {
        socket.join(roomId);
        const harmonicIndex = rooms[roomId].nodes.length + 2; // Harmonics start at 2 (fundamental is 1)
        rooms[roomId].nodes.push(socket.id);
        
        socket.emit("node:assigned", { 
          harmonicIndex, 
          baseFreq: rooms[roomId].baseFreq 
        });

        io.to(rooms[roomId].hostId).emit("host:nodeJoined", {
          totalNodes: rooms[roomId].nodes.length,
          nodeId: socket.id
        });
        
        console.log(`Node ${socket.id} joined room ${roomId} as harmonic ${harmonicIndex}`);
      } else {
        socket.emit("error", { message: "Room not found" });
      }
    });

    socket.on("audio:sync", ({ roomId, state }) => {
      // state: 'start' | 'stop' | 'update'
      // We broadcast the start time with a small offset to account for latency
      const startTime = Date.now() + 500; 
      io.to(roomId).emit("audio:command", { ...state, startTime });
    });

    socket.on("frequency:change", ({ roomId, baseFreq }) => {
      if (rooms[roomId]) {
        rooms[roomId].baseFreq = baseFreq;
        io.to(roomId).emit("frequency:updated", { baseFreq });
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      // Clean up rooms if host leaves (simple version)
      for (const roomId in rooms) {
        if (rooms[roomId].hostId === socket.id) {
          io.to(roomId).emit("host:closed");
          delete rooms[roomId];
        } else {
          const index = rooms[roomId].nodes.indexOf(socket.id);
          if (index !== -1) {
            rooms[roomId].nodes.splice(index, 1);
            io.to(rooms[roomId].hostId).emit("host:nodeLeft", {
              totalNodes: rooms[roomId].nodes.length
            });
          }
        }
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
