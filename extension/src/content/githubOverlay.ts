import { createYjsClient, generateHighlightId, type HighlightRecord } from "./yjsClient";

type FileOverlayContext = {
  filePath: string;
  container: HTMLElement;
  overlay: HTMLDivElement;
  interaction: HTMLDivElement;
  lineNumberCells: HTMLElement[];
  codeLeftPx: number;
  codeWidthPx: number;
};

const ACTIVE_HIGHLIGHTS_ATTR = "data-prh-highlight";

function isPrFilesPage(): boolean {
  return /\/pull\/\d+\/files/.test(location.pathname);
}

function getFilesRoot(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>("#files")
    || document.querySelector<HTMLElement>("[aria-label='Files changed']");
  return el as HTMLElement | null;
}

function getFilePathFromHeader(fileContainer: HTMLElement): string {
  const headerLink = fileContainer.querySelector<HTMLAnchorElement>(".file-info a.Link--primary, .file-info a.text-mono");
  if (headerLink?.textContent) return headerLink.textContent.trim();
  const header = fileContainer.querySelector<HTMLElement>("[data-path]");
  if (header) return header.getAttribute("data-path") || "unknown";
  return "unknown";
}

function collectLineNumberCells(fileContainer: HTMLElement): HTMLElement[] {
  const cells = Array.from(fileContainer.querySelectorAll<HTMLElement>("td.blob-num[data-line-number]"));
  return cells;
}

function computeCodeArea(fileContainer: HTMLElement): { left: number; width: number } {
  const firstCodeCell = fileContainer.querySelector<HTMLElement>("td.blob-code");
  if (!firstCodeCell) return { left: 0, width: fileContainer.clientWidth };
  const rect = firstCodeCell.getBoundingClientRect();
  const parentRect = fileContainer.getBoundingClientRect();
  const left = rect.left - parentRect.left + fileContainer.scrollLeft;
  return { left, width: rect.width };
}

function ensureOverlay(fileContainer: HTMLElement): FileOverlayContext {
  const filePath = getFilePathFromHeader(fileContainer);
  const overlay = document.createElement("div");
  overlay.className = "prh-overlay";
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "none";

  const interaction = document.createElement("div");
  interaction.className = "prh-interaction";
  interaction.style.position = "absolute";
  interaction.style.inset = "0";
  interaction.style.pointerEvents = "auto";
  interaction.style.background = "transparent";

  if (getComputedStyle(fileContainer).position === "static") {
    fileContainer.style.position = "relative";
  }
  fileContainer.appendChild(overlay);
  fileContainer.appendChild(interaction);

  const lnCells = collectLineNumberCells(fileContainer);
  const codeArea = computeCodeArea(fileContainer);
  return {
    filePath,
    container: fileContainer,
    overlay,
    interaction,
    lineNumberCells: lnCells,
    codeLeftPx: codeArea.left,
    codeWidthPx: codeArea.width,
  };
}

function findLineFromPoint(ctx: FileOverlayContext, clientY: number): number | null {
  const parentRect = ctx.container.getBoundingClientRect();
  const y = clientY - parentRect.top;
  let best: { dist: number; line: number } | null = null;
  for (const cell of ctx.lineNumberCells) {
    const rect = cell.getBoundingClientRect();
    const mid = (rect.top + rect.bottom) / 2 - parentRect.top;
    const dist = Math.abs(mid - y);
    const ln = parseInt(cell.getAttribute("data-line-number") || "0", 10);
    if (!best || dist < best.dist) best = { dist, line: ln };
  }
  return best ? best.line : null;
}

function renderHighlights(ctx: FileOverlayContext, records: HighlightRecord[]) {
  const forFile = records.filter(r => r.filePath === ctx.filePath);
  // Clear existing
  ctx.overlay.querySelectorAll(`div[${ACTIVE_HIGHLIGHTS_ATTR}]`).forEach(el => el.remove());
  if (forFile.length === 0) return;

  // Build map line->row rect to compute positions efficiently
  const lineToTop = new Map<number, { top: number; bottom: number }>();
  for (const cell of ctx.lineNumberCells) {
    const ln = parseInt(cell.getAttribute("data-line-number") || "0", 10);
    const rect = cell.getBoundingClientRect();
    const parentRect = ctx.container.getBoundingClientRect();
    lineToTop.set(ln, { top: rect.top - parentRect.top + ctx.container.scrollTop, bottom: rect.bottom - parentRect.top + ctx.container.scrollTop });
  }

  for (const r of forFile) {
    const start = lineToTop.get(r.startLine);
    const end = lineToTop.get(r.endLine);
    if (!start || !end) continue;
    const top = Math.min(start.top, end.top);
    const bottom = Math.max(start.bottom, end.bottom);
    const height = Math.max(2, bottom - top);
    const el = document.createElement("div");
    el.setAttribute(ACTIVE_HIGHLIGHTS_ATTR, "1");
    el.className = "prh-highlight";
    el.style.position = "absolute";
    el.style.left = `${ctx.codeLeftPx}px`;
    el.style.width = `${ctx.codeWidthPx}px`;
    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
    el.style.background = r.color || "rgba(255, 235, 59, 0.35)";
    el.style.borderLeft = `3px solid ${r.color || "#FDD835"}`;
    el.style.borderRadius = "2px";
    el.style.pointerEvents = "none";

    const label = document.createElement("div");
    label.className = "prh-label";
    label.textContent = r.userId || "anon";
    label.style.position = "absolute";
    label.style.right = "4px";
    label.style.top = "4px";
    label.style.padding = "0 6px";
    label.style.fontSize = "12px";
    label.style.lineHeight = "18px";
    label.style.background = "rgba(0,0,0,0.55)";
    label.style.color = "#fff";
    label.style.borderRadius = "9px";
    el.appendChild(label);

    ctx.overlay.appendChild(el);
  }
}

function setupInteractions(ctx: FileOverlayContext, add: (r: HighlightRecord) => void, getUserColor: () => string, getUserId: () => string | undefined) {
  let dragging = false;
  let startLine: number | null = null;
  let currentPreview: HTMLDivElement | null = null;

  const cleanupPreview = () => {
    if (currentPreview) {
      currentPreview.remove();
      currentPreview = null;
    }
  };

  const onDown = (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;
    dragging = true;
    startLine = findLineFromPoint(ctx, e.clientY);
    cleanupPreview();
    e.preventDefault();
  };
  const onMove = (e: MouseEvent) => {
    if (!dragging || startLine == null) return;
    const endLine = findLineFromPoint(ctx, e.clientY) ?? startLine;
    cleanupPreview();

    const preview: HighlightRecord = {
      id: "preview",
      filePath: ctx.filePath,
      startLine: Math.min(startLine, endLine),
      endLine: Math.max(startLine, endLine),
      color: getUserColor(),
      userId: getUserId(),
      createdAt: Date.now(),
    };
    // Render a preview locally
    const tmpOverlay = document.createElement("div");
    tmpOverlay.style.position = "absolute";
    tmpOverlay.style.inset = "0";
    ctx.overlay.appendChild(tmpOverlay);
    currentPreview = tmpOverlay;
    renderHighlights({ ...ctx, overlay: tmpOverlay }, [preview]);
  };
  const onUp = (e: MouseEvent) => {
    if (!dragging || startLine == null) return;
    const endLine = findLineFromPoint(ctx, e.clientY) ?? startLine;
    cleanupPreview();
    dragging = false;
    const s = Math.min(startLine, endLine);
    const en = Math.max(startLine, endLine);
    const rec: HighlightRecord = {
      id: generateHighlightId(ctx.filePath, s, en),
      filePath: ctx.filePath,
      startLine: s,
      endLine: en,
      color: getUserColor(),
      userId: getUserId(),
      createdAt: Date.now(),
    };
    add(rec);
  };

  ctx.interaction.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function init(): void {
  if (!isPrFilesPage()) return;
  const filesRoot = getFilesRoot();
  if (!filesRoot) return;

  const { subscribe, addHighlight } = createYjsClient();

  const userColor = () => "rgba(255, 235, 59, 0.35)";
  const userId = () => undefined;

  const fileContexts: FileOverlayContext[] = [];

  const setupForContainer = (c: HTMLElement) => {
    const ctx = ensureOverlay(c);
    fileContexts.push(ctx);
    setupInteractions(ctx, addHighlight, userColor, userId);
  };

  // Initial scan
  const containers = Array.from(filesRoot.querySelectorAll<HTMLElement>(".js-file"));
  containers.forEach(setupForContainer);

  // Observe DOM changes for lazy loading/expand collapse
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches(".js-file")) setupForContainer(n);
        n.querySelectorAll?.(".js-file").forEach((nn: Element) => setupForContainer(nn as HTMLElement));
      });
    }
  });
  mo.observe(filesRoot, { childList: true, subtree: true });

  // Re-render on scroll / resize
  let lastRecords: HighlightRecord[] = [];
  const rerender = (records: HighlightRecord[]) => {
    lastRecords = records;
    for (const ctx of fileContexts) {
      renderHighlights(ctx, records);
    }
  };
  const unsubscribe = subscribe(rerender);
  const onScrollOrResize = () => {
    // Recompute geometry and re-render using the last known records
    for (const ctx of fileContexts) {
      // update geometry
      const codeArea = (function computeCodeArea(fileContainer: HTMLElement): { left: number; width: number } {
        const firstCodeCell = fileContainer.querySelector<HTMLElement>("td.blob-code");
        if (!firstCodeCell) return { left: 0, width: fileContainer.clientWidth };
        const rect = firstCodeCell.getBoundingClientRect();
        const parentRect = fileContainer.getBoundingClientRect();
        const left = rect.left - parentRect.left + fileContainer.scrollLeft;
        return { left, width: rect.width };
      })(ctx.container);
      ctx.codeLeftPx = codeArea.left;
      ctx.codeWidthPx = codeArea.width;
    }
    for (const ctx of fileContexts) {
      renderHighlights(ctx, lastRecords);
    }
  };
  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize);
}

try {
  init();
} catch (err) {
  // no-op
}

