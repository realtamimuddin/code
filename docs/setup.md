## Setup Guide

### Prerequisites
- Node.js 18+
- Chrome (MV3) for development; Firefox support can be added later

### Run the realtime server
```bash
cd server
npm i
npm run dev
```

### Load the extension
1. Open Chrome → `chrome://extensions` → Enable Developer Mode
2. Click "Load unpacked" and choose the `extension` folder
3. Open the extension Options page and set Server URL to `http://localhost:8787`

### Test locally
1. Open any GitHub PR page
2. Shift+Click on a code line to add a highlight
3. Open the same PR in a second window; highlight appears in under a second

### Environment variables (future phases)
- `REDIS_URL` for persistence and multi-node fanout
- `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` for GitHub login

