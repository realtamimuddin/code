'use strict';

const { WebSocketServer } = require('ws');
const { createStore } = require('./store');

const PORT = process.env.PORT || 8787;
const HEARTBEAT_MS = 25_000;

const store = createStore();

/** @typedef {{
 *  id: string,
 *  login: string,
 *  avatarUrl?: string
 * }} User
 */

/**
 * Rooms are keyed by PR key. Each room has a Set of clients.
 * Client object holds ws and metadata.
 */
const roomKeyToClients = new Map();

const wss = new WebSocketServer({ port: Number(PORT) });
console.log(`[server] ws listening on :${PORT}`);

function now() {
  return Date.now();
}

function send(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch (err) {
    // ignore
  }
}

function broadcast(roomKey, msg, except) {
  const clients = roomKeyToClients.get(roomKey);
  if (!clients) return;
  const payload = JSON.stringify(msg);
  for (const client of clients) {
    if (except && client === except) continue;
    try {
      client.ws.send(payload);
    } catch (_) {}
  }
}

function joinRoom(roomKey, client) {
  if (!roomKeyToClients.has(roomKey)) {
    roomKeyToClients.set(roomKey, new Set());
  }
  roomKeyToClients.get(roomKey).add(client);
}

function leaveRoom(roomKey, client) {
  const set = roomKeyToClients.get(roomKey);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) roomKeyToClients.delete(roomKey);
}

wss.on('connection', (ws) => {
  const client = {
    ws,
    user: null,
    roomKey: null,
    color: '#ffd54f',
    isAlive: true,
  };

  ws.on('pong', () => {
    client.isAlive = true;
  });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch (err) {
      return send(ws, { type: 'error', code: 'bad_json', message: 'Invalid JSON' });
    }

    switch (msg.type) {
      case 'join': {
        const { prKey, user, color } = msg;
        if (!prKey || !user || !user.id || !user.login) {
          return send(ws, { type: 'error', code: 'bad_join', message: 'Missing prKey or user' });
        }
        client.user = user;
        client.color = color || client.color;
        client.roomKey = prKey;
        joinRoom(prKey, client);

        // add/update presence
        store.updatePresence(prKey, {
          user,
          color: client.color,
          lastSeen: now(),
        });

        // send full state
        const snapshot = store.getState(prKey);
        send(ws, { type: 'state.full', prKey, highlights: snapshot.highlights, version: snapshot.version });

        // broadcast presence to others
        const presence = store.listPresence(prKey);
        broadcast(prKey, { type: 'presence.update', prKey, users: presence }, null);
        break;
      }

      case 'highlight.add': {
        const { prKey, highlight } = msg;
        if (!client.roomKey || client.roomKey !== prKey) return;
        const applied = store.applyAdd(prKey, highlight);
        broadcast(prKey, { type: 'highlight.applied', prKey, highlight: applied }, null);
        break;
      }

      case 'highlight.remove': {
        const { prKey, id } = msg;
        if (!client.roomKey || client.roomKey !== prKey) return;
        const removedId = store.applyRemove(prKey, id);
        if (removedId) {
          broadcast(prKey, { type: 'highlight.removed', prKey, id: removedId }, null);
        }
        break;
      }

      case 'resync.request': {
        const { prKey } = msg;
        if (!client.roomKey || client.roomKey !== prKey) return;
        const snapshot = store.getState(prKey);
        send(ws, { type: 'state.full', prKey, highlights: snapshot.highlights, version: snapshot.version });
        break;
      }

      default:
        send(ws, { type: 'error', code: 'unknown_type', message: `Unknown type ${msg.type}` });
    }
  });

  ws.on('close', () => {
    if (client.roomKey && client.user) {
      // update presence
      store.removePresence(client.roomKey, client.user.id);
      const presence = store.listPresence(client.roomKey);
      broadcast(client.roomKey, { type: 'presence.update', prKey: client.roomKey, users: presence }, null);
      leaveRoom(client.roomKey, client);
    }
  });
});

// heartbeat
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const c = Array.from(roomKeyToClients.values()).flatMap((set) => Array.from(set)).find((x) => x.ws === ws);
    if (!c) return;
    if (!c.isAlive) {
      try { ws.terminate(); } catch (_) {}
      return;
    }
    c.isAlive = false;
    try { ws.ping(); } catch (_) {}
  });
}, HEARTBEAT_MS);

wss.on('close', function close() {
  clearInterval(interval);
});

