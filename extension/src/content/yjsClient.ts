import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export type HighlightRecord = {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  color: string;
  userId?: string;
  avatarUrl?: string;
  createdAt: number;
};

export type YjsClient = {
  doc: Y.Doc;
  provider: WebsocketProvider;
  highlightsByFile: Y.Map<Y.Map<Y.Map<any>>>;
  addHighlight: (rec: HighlightRecord) => void;
  removeHighlight: (filePath: string, id: string) => void;
  subscribe: (cb: (records: HighlightRecord[]) => void) => () => void;
};

function getRoomIdFromUrl(): string {
  const { hostname, pathname } = window.location;
  const m = pathname.match(/^\/(.+?)\/(.+?)\/pull\/(\d+)/);
  if (!m) return `${hostname}${pathname}`;
  const owner = m[1];
  const repo = m[2];
  const pr = m[3];
  return `${owner}/${repo}#${pr}`;
}

function getDefaultRealtimeBaseUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://localhost:8787/yjs`;
}

export function createYjsClient(options?: { realtimeUrl?: string; roomId?: string }): YjsClient {
  const doc = new Y.Doc();
  const roomId = options?.roomId ?? getRoomIdFromUrl();
  const base = options?.realtimeUrl ?? getDefaultRealtimeBaseUrl();
  const urlWithRoom = `${base.replace(/\/$/, "")}/${encodeURIComponent(roomId)}`;
  const provider = new WebsocketProvider(urlWithRoom, roomId, doc, { connect: true });

  const highlightsByFile = doc.getMap<Y.Map<Y.Map<any>>>("highlights");

  const addHighlight = (rec: HighlightRecord) => {
    const fileMap = highlightsByFile.get(rec.filePath) ?? new Y.Map<Y.Map<any>>();
    if (!highlightsByFile.has(rec.filePath)) highlightsByFile.set(rec.filePath, fileMap);
    const yrec = new Y.Map<any>();
    yrec.set("id", rec.id);
    yrec.set("filePath", rec.filePath);
    yrec.set("startLine", rec.startLine);
    yrec.set("endLine", rec.endLine);
    yrec.set("color", rec.color);
    if (rec.userId) yrec.set("userId", rec.userId);
    if (rec.avatarUrl) yrec.set("avatarUrl", rec.avatarUrl);
    yrec.set("createdAt", rec.createdAt);
    fileMap.set(rec.id, yrec);
  };

  const removeHighlight = (filePath: string, id: string) => {
    const fm = highlightsByFile.get(filePath);
    if (!fm) return;
    fm.delete(id);
  };

  const subscribe = (cb: (records: HighlightRecord[]) => void) => {
    const handler = () => {
      const out: HighlightRecord[] = [];
      highlightsByFile.forEach((fileMap, filePath) => {
        fileMap.forEach((yrec) => {
          const rec: HighlightRecord = {
            id: yrec.get("id"),
            filePath,
            startLine: yrec.get("startLine"),
            endLine: yrec.get("endLine"),
            color: yrec.get("color"),
            userId: yrec.get("userId") ?? undefined,
            avatarUrl: yrec.get("avatarUrl") ?? undefined,
            createdAt: yrec.get("createdAt") ?? Date.now(),
          };
          out.push(rec);
        });
      });
      cb(out);
    };
    doc.on("update", handler);
    // initial
    handler();
    return () => {
      doc.off("update", handler);
    };
  };

  return { doc, provider, highlightsByFile, addHighlight, removeHighlight, subscribe };
}

export function generateHighlightId(filePath: string, startLine: number, endLine: number): string {
  return `${filePath}:${startLine}-${endLine}:${Math.random().toString(36).slice(2, 8)}`;
}
