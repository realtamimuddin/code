type Highlight = {
  lineKey: string;
  user: string;
  color: string;
  timestamp: number;
};

type LineRect = {
  lineKey: string;
  rect: DOMRect;
};

export function createOverlay() {
  const root = document.createElement('div');
  root.style.position = 'absolute';
  root.style.pointerEvents = 'none';
  root.style.top = '0';
  root.style.left = '0';
  root.style.width = '100%';
  root.style.height = '0';
  root.style.zIndex = '9999';

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  root.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  const highlights: Map<string, Highlight> = new Map();
  let lineRects: LineRect[] = [];

  function setHighlight(lineKey: string, user: string, color: string, timestamp: number) {
    const existing = highlights.get(`${lineKey}:${user}`);
    if (!existing || timestamp >= existing.timestamp) {
      highlights.set(`${lineKey}:${user}`, { lineKey, user, color, timestamp });
      draw();
    }
  }

  function removeHighlight(lineKey: string, user: string, timestamp: number) {
    const existing = highlights.get(`${lineKey}:${user}`);
    if (existing && timestamp >= existing.timestamp) {
      highlights.delete(`${lineKey}:${user}`);
      draw();
    }
  }

  function clearHighlights() {
    highlights.clear();
    draw();
  }

  function updateLayout(nextRects: LineRect[]) {
    lineRects = nextRects;
    draw();
  }

  function getViewportHighlights() {
    return Array.from(highlights.values());
  }

  function resizeCanvasToDisplaySize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw() {
    resizeCanvasToDisplaySize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = window.devicePixelRatio || 1;
    const scrollY = window.scrollY;
    const viewTop = scrollY;
    const viewBottom = scrollY + window.innerHeight;

    for (const line of lineRects) {
      const y = line.rect.top + scrollY; // absolute document Y
      const h = line.rect.height;
      if (y + h < viewTop - 4 || y > viewBottom + 4) continue; // lazy paint

      const perLine = Array.from(highlights.values()).filter((hgh) => hgh.lineKey === line.lineKey);
      if (perLine.length === 0) continue;

      const screenY = (line.rect.top) * dpr;
      const screenX = (line.rect.left) * dpr;
      const screenW = (line.rect.width) * dpr;
      const screenH = (line.rect.height) * dpr;

      const radius = 4 * dpr;
      const padding = 1 * dpr;
      for (const hgh of perLine) {
        ctx.fillStyle = hexToRgba(hgh.color, 0.25);
        roundRect(ctx, screenX + padding, screenY + padding, screenW - padding * 2, screenH - padding * 2, radius);
        ctx.fill();
      }
    }
  }

  return {
    root,
    api: { setHighlight, removeHighlight, clearHighlights, updateLayout, getViewportHighlights }
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexToRgba(hex: string, alpha: number) {
  const parsed = hex.replace('#', '');
  const bigint = parseInt(parsed.length === 3 ? parsed.split('').map((c) => c + c).join('') : parsed, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

