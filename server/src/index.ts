import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';

type HighlightMessage = {
  type: 'highlight:add' | 'highlight:remove';
  prKey: string;
  lineKey: string;
  user: string;
  color: string;
  timestamp: number;
};

type SyncStateItem = {
  lineKey: string;
  user: string;
  color: string;
  timestamp: number;
};

const PORT = Number(process.env.PORT || 8787);
const REDIS_URL = process.env.REDIS_URL || '';

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const redis = REDIS_URL ? new Redis(REDIS_URL) : null;

// In-memory fallback storage when Redis not provided
const roomState = new Map<string, Map<string, SyncStateItem>>(); // room -> key=user:line -> item

function getRoomState(prKey: string): Map<string, SyncStateItem> {
  let m = roomState.get(prKey);
  if (!m) { m = new Map(); roomState.set(prKey, m); }
  return m;
}

function applyMessage(prKey: string, msg: HighlightMessage): SyncStateItem | null {
  const state = getRoomState(prKey);
  const key = `${msg.user}:${msg.lineKey}`;
  const existing = state.get(key);
  if (msg.type === 'highlight:add') {
    if (!existing || msg.timestamp >= existing.timestamp) {
      const item: SyncStateItem = { lineKey: msg.lineKey, user: msg.user, color: msg.color, timestamp: msg.timestamp };
      state.set(key, item);
      return item;
    }
  } else if (msg.type === 'highlight:remove') {
    if (!existing || msg.timestamp >= existing.timestamp) {
      state.delete(key);
      return { lineKey: msg.lineKey, user: msg.user, color: msg.color, timestamp: msg.timestamp };
    }
  }
  return null;
}

function serializeState(prKey: string): SyncStateItem[] {
  return Array.from(getRoomState(prKey).values());
}

// Room membership tracking
const wsRooms = new Map<WebSocket, string>();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const prKey = url.searchParams.get('room');
  if (!prKey) { ws.close(); return; }
  wsRooms.set(ws, prKey);

  // Send current state
  ws.send(JSON.stringify({ type: 'sync:state', state: serializeState(prKey) }));

  ws.on('message', (data) => {
    let msg: HighlightMessage | null = null;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || msg.prKey !== prKey) return;
    const applied = applyMessage(prKey, msg);
    if (!applied) return;

    // Broadcast to the room (including sender for idempotence)
    for (const client of wss.clients) {
      if (wsRooms.get(client) !== prKey) continue;
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  });

  ws.on('close', () => {
    wsRooms.delete(ws);
  });
});

app.get('/health', (_, res) => res.json({ ok: true }));

server.listen(PORT, () => {
  console.log(`WS server listening on :${PORT}`);
});

