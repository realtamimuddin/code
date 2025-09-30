import { v4 as uuidv4 } from './uuid';

// Basic DOM adapter for GitHub PR files
function getPrKey(): string | null {
  const url = new URL(window.location.href);
  const [owner, repo, , pr, prNumber] = url.pathname.split('/').filter(Boolean);
  if (owner && repo && pr === 'pull' && prNumber) {
    return `${url.host}:${owner}/${repo}#${prNumber}`;
  }
  return null;
}

function queryFileContainers(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('#files .file');
}

function getFilePath(container: HTMLElement): string | null {
  const header = container.querySelector('[data-path]') as HTMLElement | null;
  return header ? header.getAttribute('data-path') : null;
}

function lineElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.js-file-line')) as HTMLElement[];
}

// Overlay canvas per file container
class FileOverlay {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lineRects: DOMRect[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.zIndex = '10';
    this.ctx = this.canvas.getContext('2d')!;
    const parent = container.querySelector('.blob-wrapper') as HTMLElement | null || container;
    parent.style.position = 'relative';
    parent.appendChild(this.canvas);
    this.recompute();
    new ResizeObserver(() => this.recompute()).observe(parent);
  }

  recompute() {
    const parent = this.canvas.parentElement as HTMLElement;
    const rect = parent.getBoundingClientRect();
    this.canvas.width = Math.ceil(rect.width);
    this.canvas.height = Math.ceil(rect.height);
    const lines = lineElements(this.container);
    this.lineRects = lines.map((el) => el.getBoundingClientRect());
  }

  drawHighlights(ranges: { startLine: number, endLine: number, color: string }[]) {
    const parentRect = (this.canvas.parentElement as HTMLElement).getBoundingClientRect();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const r of ranges) {
      const startIdx = Math.max(0, r.startLine - 1);
      const endIdx = Math.min(this.lineRects.length - 1, r.endLine - 1);
      if (startIdx > endIdx) continue;
      const first = this.lineRects[startIdx];
      const last = this.lineRects[endIdx];
      if (!first || !last) continue;
      const x = 0;
      const y = first.top - parentRect.top;
      const width = parentRect.width;
      const height = (last.bottom - first.top);
      this.ctx.fillStyle = hexToRgba(r.color, 0.25);
      this.ctx.fillRect(x, y, width, height);
    }
  }
}

function hexToRgba(hex: string, a: number): string {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Wiring
const prKey = getPrKey();
if (!prKey) {
  // Not a PR page
} else {
  const port = chrome.runtime.connect({ name: 'crh' });
  const user = { id: 'local-dev', login: 'local-dev' };
  const color = '#ffd54f';

  const fileOverlays = new Map<string, FileOverlay>();
  const filePathToHighlights = new Map<string, { startLine: number, endLine: number, color: string }[]>();

  function refreshOverlays() {
    for (const container of Array.from(queryFileContainers())) {
      const filePath = getFilePath(container);
      if (!filePath) continue;
      if (!fileOverlays.has(filePath)) fileOverlays.set(filePath, new FileOverlay(container));
      const overlay = fileOverlays.get(filePath)!;
      overlay.recompute();
      overlay.drawHighlights(filePathToHighlights.get(filePath) || []);
    }
  }

  port.onMessage.addListener((msg: any) => {
    switch (msg.type) {
      case 'state.full': {
        filePathToHighlights.clear();
        for (const h of msg.highlights as any[]) {
          if (!filePathToHighlights.has(h.filePath)) filePathToHighlights.set(h.filePath, []);
          filePathToHighlights.get(h.filePath)!.push({ startLine: h.startLine, endLine: h.endLine, color: h.color });
        }
        refreshOverlays();
        break;
      }
      case 'highlight.applied': {
        const h = msg.highlight;
        if (!filePathToHighlights.has(h.filePath)) filePathToHighlights.set(h.filePath, []);
        filePathToHighlights.get(h.filePath)!.push({ startLine: h.startLine, endLine: h.endLine, color: h.color });
        refreshOverlays();
        break;
      }
      case 'highlight.removed': {
        for (const arr of filePathToHighlights.values()) {
          const idx = arr.findIndex((x: any) => x.id === msg.id);
          if (idx >= 0) arr.splice(idx, 1);
        }
        refreshOverlays();
        break;
      }
      case 'presence.update': {
        // TODO: show presence in popup
        break;
      }
    }
  });

  // Join on load
  port.postMessage({ type: 'join', prKey, user, color });

  // Demo: mousedown drag to create highlight for the visible file under cursor
  let selectionStartLine: number | null = null;
  document.addEventListener('mousedown', (ev) => {
    const el = (ev.target as HTMLElement).closest('.js-file-line') as HTMLElement | null;
    if (!el) return;
    selectionStartLine = Number(el.getAttribute('data-line-number') || '0');
  });
  document.addEventListener('mouseup', (ev) => {
    if (selectionStartLine == null) return;
    const el = (ev.target as HTMLElement).closest('.js-file-line') as HTMLElement | null;
    if (!el) { selectionStartLine = null; return; }
    const endLine = Number(el.getAttribute('data-line-number') || '0');
    const container = el.closest('.file') as HTMLElement | null;
    const filePath = container ? getFilePath(container) : null;
    if (!filePath) { selectionStartLine = null; return; }
    const startLine = Math.min(selectionStartLine, endLine);
    const finalEnd = Math.max(selectionStartLine, endLine);
    selectionStartLine = null;
    const highlight = {
      id: uuidv4(),
      prKey,
      filePath,
      startLine: startLine,
      endLine: finalEnd,
      color,
      author: user,
      timestamp: Date.now()
    };
    port.postMessage({ type: 'highlight.add', prKey, highlight });
  });
}

