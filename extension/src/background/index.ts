type Message =
  | { type: 'join', prKey: string, user: { id: string, login: string, avatarUrl?: string }, color: string }
  | { type: 'highlight.add', prKey: string, highlight: any }
  | { type: 'highlight.remove', prKey: string, id: string }
  | { type: 'resync.request', prKey: string };

type ServerMessage = any;

const WS_URL = (self as any).WS_URL || 'ws://localhost:8787';

const prKeyToSocket: Map<string, WebSocket> = new Map();
const prKeyToPorts: Map<string, chrome.runtime.Port[]> = new Map();

function broadcastToContent(prKey: string, msg: ServerMessage) {
  const ports = prKeyToPorts.get(prKey) || [];
  for (const port of ports) {
    try { port.postMessage(msg); } catch (_) {}
  }
}

function connect(prKey: string) {
  if (prKeyToSocket.has(prKey)) return prKeyToSocket.get(prKey)!;
  const ws = new WebSocket(WS_URL);
  prKeyToSocket.set(prKey, ws);

  ws.onclose = () => {
    prKeyToSocket.delete(prKey);
    // backoff reconnect
    setTimeout(() => connect(prKey), 1000);
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string);
      if (msg && msg.prKey) broadcastToContent(msg.prKey, msg);
    } catch (_) {}
  };

  return ws;
}

chrome.runtime.onConnect.addListener((port: any) => {
  if (port.name !== 'crh') return;
  let prKey: string | null = null;

  port.onMessage.addListener((msg: Message) => {
    switch (msg.type) {
      case 'join': {
        prKey = msg.prKey;
        const ws = connect(msg.prKey);
        if (!prKeyToPorts.has(msg.prKey)) prKeyToPorts.set(msg.prKey, []);
        prKeyToPorts.get(msg.prKey)!.push(port);
        ws.addEventListener('open', () => ws.send(JSON.stringify(msg)));
        break;
      }
      case 'highlight.add':
      case 'highlight.remove':
      case 'resync.request': {
        if (!prKey) return;
        const ws = prKeyToSocket.get(prKey);
        if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
        break;
      }
    }
  });

  port.onDisconnect.addListener(() => {
    if (prKey) {
      const arr = prKeyToPorts.get(prKey) || [];
      prKeyToPorts.set(prKey, arr.filter((p) => p !== port));
    }
  });
});

