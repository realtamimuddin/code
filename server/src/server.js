import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/realtime' });

// roomId -> { clients: Set<ws>, highlights: Map<id, highlight> }
const ROOMS = new Map();

function getRoom(roomId) {
  if (!ROOMS.has(roomId)) {
    ROOMS.set(roomId, { clients: new Set(), highlights: new Map() });
  }
  return ROOMS.get(roomId);
}

function broadcast(room, msgObj) {
  const json = JSON.stringify(msgObj);
  for (const client of room.clients) {
    if (client.readyState === 1) client.send(json);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('roomId');
  const clientId = url.searchParams.get('clientId');
  if (!roomId) {
    ws.close();
    return;
  }
  const room = getRoom(roomId);
  room.clients.add(ws);

  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'join') {
      ws.send(JSON.stringify({ type: 'state', roomId, highlights: Array.from(room.highlights.values()) }));
      return;
    }
    if (msg.type === 'add') {
      const hl = msg.highlight;
      if (!hl?.id) return;
      // LWW apply
      const existing = room.highlights.get(hl.id);
      if (!existing || compareVersion(hl.version, existing.version) > 0) {
        room.highlights.set(hl.id, hl);
        broadcast(room, { type: 'add', roomId, highlight: hl });
      }
      return;
    }
    if (msg.type === 'remove') {
      const id = msg.highlightId;
      const existing = room.highlights.get(id);
      if (!existing || compareVersion(msg.version, existing.version) >= 0) {
        room.highlights.delete(id);
        broadcast(room, { type: 'remove', roomId, highlightId: id });
      }
      return;
    }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
  });
});

function compareVersion(a, b) {
  if (!a && !b) return 0;
  if (a && !b) return 1;
  if (!a && b) return -1;
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.clientId.localeCompare(b.clientId);
}

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => {
  console.log(`Realtime server listening on http://localhost:${PORT}`);
});

