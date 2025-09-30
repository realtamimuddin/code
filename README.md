## PR Code Review Highlights

Quick start for local development.

### Server
1. Node 18+
2. Install deps:
   - `cd server && npm i`
3. Run:
   - `npm run dev`
   - Server on `http://localhost:8787`, WS path `/realtime`

### Extension (Chrome MV3)
1. Open `chrome://extensions` → Enable Developer Mode
2. Load unpacked → select `extension` folder
3. Click the extension → Options → set Server URL (defaults to `http://localhost:8787`)
4. Open a GitHub PR URL. Shift+Click on a code line to add a highlight.
5. Open the same PR in another window with extension loaded to see real-time sync.

### Notes
- Overlay aligns to GitHub `#files` container; reacts to scroll/resize/mutations.
- Background maintains one WebSocket per PR room, shared by tabs.
- LWW conflict resolution on server for add/remove.

# code