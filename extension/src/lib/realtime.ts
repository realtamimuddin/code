export type HighlightMessage = {
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

type EventMap = {
  'highlight:add': (msg: HighlightMessage) => void;
  'highlight:remove': (msg: HighlightMessage) => void;
  'sync:state': (state: SyncStateItem[]) => void;
  'status': (status: { connected: boolean }) => void;
};

export class RealtimeClient {
  private url: string;
  private ws: WebSocket | null = null;
  private listeners: { [K in keyof EventMap]?: Set<EventMap[K]> } = {};
  private prKey: string | null = null;

  constructor(url: string) {
    this.url = url.replace('http', 'ws');
  }

  connect(prKey: string) {
    this.prKey = prKey;
    const ws = new WebSocket(`${this.url}?room=${encodeURIComponent(prKey)}`);
    this.ws = ws;

    ws.addEventListener('open', () => this.emit('status', { connected: true }));
    ws.addEventListener('close', () => this.emit('status', { connected: false }));
    ws.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        if (!data || typeof data !== 'object') return;
        if (data.type === 'sync:state') this.emit('sync:state', data.state);
        if (data.type === 'highlight:add') this.emit('highlight:add', data as HighlightMessage);
        if (data.type === 'highlight:remove') this.emit('highlight:remove', data as HighlightMessage);
      } catch {
        // ignore
      }
    });
  }

  send(msg: HighlightMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  on<K extends keyof EventMap>(event: K, cb: EventMap[K]) {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event]!.add(cb);
    return () => this.listeners[event]!.delete(cb);
  }

  private emit<K extends keyof EventMap>(event: K, payload: Parameters<EventMap[K]>[0]) {
    const set = this.listeners[event];
    if (!set) return;
    for (const cb of set) cb(payload as any);
  }
}

