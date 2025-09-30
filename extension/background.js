// Background service worker (MV3)
// Manages rooms per PR and a single WebSocket per room.

const ROOM_SOCKETS = new Map(); // roomId -> { ws, tabs: Set<number>, clientId }
const TAB_ROOMS = new Map(); // tabId -> roomId
const CLIENT_ID_KEY = 'clientId';

async function getClientId() {
  const { clientId } = await chrome.storage.local.get(CLIENT_ID_KEY);
  if (clientId) return clientId;
  const newId = crypto.randomUUID();
  await chrome.storage.local.set({ [CLIENT_ID_KEY]: newId });
  return newId;
}

function connectRoom(roomId) {
  if (ROOM_SOCKETS.has(roomId)) return ROOM_SOCKETS.get(roomId);
  const clientIdPromise = getClientId();
  const socketEntry = { ws: null, tabs: new Set(), clientId: null };
  ROOM_SOCKETS.set(roomId, socketEntry);

  (async () => {
    const clientId = await clientIdPromise;
    socketEntry.clientId = clientId;
    const url = await getServerUrl();
    const ws = new WebSocket(`${url.replace('http', 'ws')}/realtime?roomId=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`);
    socketEntry.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomId, clientId }));
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      for (const tabId of socketEntry.tabs) {
        chrome.tabs.sendMessage(tabId, { source: 'bg', roomId, payload: msg }).catch(() => {});
      }
    };
    ws.onclose = () => {
      // Attempt simple reconnect with backoff
      setTimeout(() => {
        if (ROOM_SOCKETS.get(roomId) === socketEntry && socketEntry.tabs.size > 0) {
          ROOM_SOCKETS.delete(roomId);
          connectRoom(roomId);
        }
      }, 1000);
    };
    ws.onerror = () => {};
  })();

  return socketEntry;
}

async function getServerUrl() {
  const { serverUrl } = await chrome.storage.local.get('serverUrl');
  return serverUrl || 'http://localhost:8787';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.source !== 'content') return;
    const { type, roomId, data } = message;
    if (!roomId) return;

    if (type === 'hello') {
      const entry = connectRoom(roomId);
      if (sender.tab?.id != null) {
        entry.tabs.add(sender.tab.id);
        TAB_ROOMS.set(sender.tab.id, roomId);
      }
      sendResponse({ ok: true });
      return;
    }

    if (type === 'ws-send') {
      const entry = ROOM_SOCKETS.get(roomId);
      if (entry?.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify(data));
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'socket_not_ready' });
      }
      return;
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const roomId = TAB_ROOMS.get(tabId);
  if (!roomId) return;
  TAB_ROOMS.delete(tabId);
  const entry = ROOM_SOCKETS.get(roomId);
  if (!entry) return;
  entry.tabs.delete(tabId);
  if (entry.tabs.size === 0) {
    try { entry.ws?.close(); } catch {}
    ROOM_SOCKETS.delete(roomId);
  }
});

