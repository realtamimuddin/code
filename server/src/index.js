import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { setupWSConnection } from 'y-websocket/bin/utils.js';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8787;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { url } = request;
  if (!url || !url.startsWith('/yjs')) {
    socket.destroy();
    return;
  }
  // URL format: /yjs/<room-id>
  wss.handleUpgrade(request, socket, head, (ws) => {
    const params = new URL(request.url, `http://${request.headers.host}`).pathname.split('/');
    const roomName = decodeURIComponent(params[2] || 'default');
    setupWSConnection(ws, request, { docName: roomName });
  });
});

