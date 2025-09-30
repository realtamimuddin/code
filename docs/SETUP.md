## Setup Guide

### 1) Realtime Server

Run locally:

```bash
cd /workspace/server
npm install
npm start
# listens on ws://localhost:8787
```

Environment:
- `PORT` (default 8787)

Deploy behind TLS (WSS) using a reverse proxy (Nginx/Caddy) or a platform with TLS termination (Render/Fly.io). Point the extension to `wss://<your-host>` by setting `WS_URL` at build time (see below).

### 2) Browser Extension (Chrome MV3, works in Firefox with minor changes)

Dev build:
```bash
cd /workspace/extension
npm install
npm run dev
```

This generates an `extension/dist` directory after the first build. In Chrome:
- Open `chrome://extensions`
- Enable Developer mode
- Load unpacked → select `extension/dist`

To point to your server:
- Set `WS_URL` during build: `WS_URL=wss://your-host.example.com:443 npm run build`

### 3) GitHub OAuth (optional for initial scaffold)

Later phases implement OAuth with `chrome.identity.launchWebAuthFlow`.
For now, the scaffold uses a local identity stub.

When ready to enable OAuth:
1. Create a GitHub OAuth App
   - Homepage URL: your extension support page
   - Authorization callback URL: an extension redirect URL (via `launchWebAuthFlow`), or your hosted auth bridge
2. Store `client_id` and `client_secret` securely on the server (never in the extension)
3. Server validates tokens and checks repo access before allowing `join`

### 4) Redis Persistence (optional)

The server runs with in-memory CRDT by default. To add Redis:
- Install `ioredis` (already declared as optional dependency)
- Implement a Redis-backed adapter for the store (Phase 4)
- Configure via env: `REDIS_URL`, `REDIS_TLS=true`

### 5) Production Notes

- Use WSS and HTTPS only
- Restrict rooms to collaborators by validating access tokens server-side
- Monitor memory and fanout; consider managed realtime (Ably/Liveblocks) if needed

