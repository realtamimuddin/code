# PR Highlights (Realtime) - Workspace

This workspace scaffolds a browser extension plus a minimal realtime server for collaborative code line highlighting on GitHub PR pages.

## Structure

- `extension/`: Chrome/Firefox extension (Manifest V3) with content script overlay, background service worker, and popup UI
- `server/`: Node.js Express + y-websocket server for Yjs realtime sync

## Quick Start

1) Realtime server

```bash
cd server
npm install
npm run start
# Server: http://localhost:8787, WS: ws://localhost:8787/yjs/<room>
```

2) Extension build

```bash
cd extension
npm install
npm run build
# Load `extension/dist` as an unpacked extension
```

3) Try it on GitHub

- Open a PR `Files changed` tab. Drag over lines to create a highlight.
- Open the same PR in another profile with the extension to see realtime updates.

## Config & OAuth

- Yjs WS endpoint defaults to `ws://localhost:8787/yjs/<room>`.
- OAuth with GitHub is stubbed. Create a GitHub OAuth app and implement code exchange on the server if you need identity.

## Notes

- The overlay aligns to GitHub `td.blob-num` and `td.blob-code` cells; minor DOM/CSS changes on GitHub may require selector updates.