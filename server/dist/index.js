// src/index.ts
import http from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import Redis from "ioredis";
var PORT = Number(process.env.PORT || 8787);
var REDIS_URL = process.env.REDIS_URL || "";
var app = express();
app.use(cors());
var server = http.createServer(app);
var wss = new WebSocketServer({ server });
var redis = REDIS_URL ? new Redis(REDIS_URL) : null;
var roomState = /* @__PURE__ */ new Map();
function getRoomState(prKey) {
  let m = roomState.get(prKey);
  if (!m) {
    m = /* @__PURE__ */ new Map();
    roomState.set(prKey, m);
  }
  return m;
}
function applyMessage(prKey, msg) {
  const state = getRoomState(prKey);
  const key = `${msg.user}:${msg.lineKey}`;
  const existing = state.get(key);
  if (msg.type === "highlight:add") {
    if (!existing || msg.timestamp >= existing.timestamp) {
      const item = { lineKey: msg.lineKey, user: msg.user, color: msg.color, timestamp: msg.timestamp };
      state.set(key, item);
      return item;
    }
  } else if (msg.type === "highlight:remove") {
    if (!existing || msg.timestamp >= existing.timestamp) {
      state.delete(key);
      return { lineKey: msg.lineKey, user: msg.user, color: msg.color, timestamp: msg.timestamp };
    }
  }
  return null;
}
function serializeState(prKey) {
  return Array.from(getRoomState(prKey).values());
}
var wsRooms = /* @__PURE__ */ new Map();
wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const prKey = url.searchParams.get("room");
  if (!prKey) {
    ws.close();
    return;
  }
  wsRooms.set(ws, prKey);
  ws.send(JSON.stringify({ type: "sync:state", state: serializeState(prKey) }));
  ws.on("message", (data) => {
    let msg = null;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || msg.prKey !== prKey) return;
    const applied = applyMessage(prKey, msg);
    if (!applied) return;
    for (const client of wss.clients) {
      if (wsRooms.get(client) !== prKey) continue;
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  });
  ws.on("close", () => {
    wsRooms.delete(ws);
  });
});
app.get("/health", (_, res) => res.json({ ok: true }));
server.listen(PORT, () => {
  console.log(`WS server listening on :${PORT}`);
});
