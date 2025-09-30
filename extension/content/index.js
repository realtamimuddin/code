// Content script: inject overlay, map GitHub DOM, communicate with background

const STATE = {
  roomId: null,
  overlayRoot: null,
  highlights: new Map(), // highlightId -> highlight
  fileIndex: new Map(), // filePath -> { containerEl, lines: Map(lineNumber->lineEl) }
};

function getRoomIdFromUrl() {
  try {
    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!m) return null;
    return `gh://${m[1]}/${m[2]}/pull/${m[3]}`;
  } catch { return null; }
}

function initOverlay() {
  const existing = document.getElementById('pr-highlights-overlay-root');
  if (existing) return existing;
  const root = document.createElement('div');
  root.id = 'pr-highlights-overlay-root';
  root.style.position = 'absolute';
  root.style.left = '0';
  root.style.top = '0';
  root.style.width = '100%';
  root.style.pointerEvents = 'none';
  root.style.zIndex = '999';
  const files = document.getElementById('files');
  const anchor = files || document.body;
  anchor.appendChild(root);
  STATE.overlayRoot = root;
  return root;
}

function buildFileIndex() {
  STATE.fileIndex.clear();
  const fileWrappers = document.querySelectorAll('#files .file');
  fileWrappers.forEach((file) => {
    const header = file.querySelector('[data-path]');
    const filePath = header?.getAttribute('data-path');
    if (!filePath) return;
    const lines = new Map();
    file.querySelectorAll('tr.js-file-line').forEach((tr) => {
      const lineNumEl = tr.querySelector('td.blob-num');
      const codeEl = tr.querySelector('td.blob-code');
      if (!lineNumEl || !codeEl) return;
      const lineNumber = parseInt(lineNumEl.dataset.lineNumber || lineNumEl.getAttribute('data-line-number') || lineNumEl.textContent, 10);
      if (!Number.isFinite(lineNumber)) return;
      lines.set(lineNumber, tr);
    });
    STATE.fileIndex.set(filePath, { containerEl: file, lines });
  });
}

function lineRect(filePath, lineNumber) {
  const file = STATE.fileIndex.get(filePath);
  if (!file) return null;
  const tr = file.lines.get(lineNumber);
  if (!tr) return null;
  const codeTd = tr.querySelector('td.blob-code');
  if (!codeTd) return null;
  const r = codeTd.getBoundingClientRect();
  const filesEl = document.getElementById('files') || document.body;
  const base = filesEl.getBoundingClientRect();
  return { x: r.left - base.left + filesEl.scrollLeft, y: r.top - base.top + filesEl.scrollTop, w: r.width, h: r.height };
}

function renderHighlights() {
  if (!STATE.overlayRoot) return;
  STATE.overlayRoot.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const hl of STATE.highlights.values()) {
    for (let ln = hl.lineStart; ln <= hl.lineEnd; ln += 1) {
      const rect = lineRect(hl.filePath, ln);
      if (!rect) continue;
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = `${rect.x}px`;
      el.style.top = `${rect.y}px`;
      el.style.width = `${rect.w}px`;
      el.style.height = `${rect.h}px`;
      el.style.background = hexToRgba(hl.color || '#ffeb3b', 0.35);
      el.style.pointerEvents = 'none';
      frag.appendChild(el);
    }
  }
  STATE.overlayRoot.appendChild(frag);
}

function hexToRgba(hex, alpha) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function setupInteractions() {
  document.addEventListener('click', (ev) => {
    if (!ev.shiftKey) return;
    const tr = ev.target?.closest?.('tr.js-file-line');
    if (!tr) return;
    const fileWrapper = tr.closest('.file');
    const header = fileWrapper?.querySelector('[data-path]');
    const filePath = header?.getAttribute('data-path');
    const lineNumEl = tr.querySelector('td.blob-num');
    const lineNumber = parseInt(lineNumEl?.dataset.lineNumber || lineNumEl?.getAttribute('data-line-number') || lineNumEl?.textContent, 10);
    if (!filePath || !Number.isFinite(lineNumber)) return;
    const highlight = {
      id: crypto.randomUUID(),
      roomId: STATE.roomId,
      filePath,
      side: 'unified',
      lineStart: lineNumber,
      lineEnd: lineNumber,
      color: '#ffeb3b',
      author: { userId: 'anon' },
      version: { ts: Date.now(), counter: 0, clientId: 'anon' },
      createdAt: Date.now()
    };
    STATE.highlights.set(highlight.id, highlight);
    renderHighlights();
    sendWs({ type: 'add', roomId: STATE.roomId, highlight });
  }, true);
}

function observeLayoutChanges() {
  const files = document.getElementById('files');
  const root = files || document.body;
  const observer = new MutationObserver(() => {
    buildFileIndex();
    requestAnimationFrame(renderHighlights);
  });
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('scroll', () => requestAnimationFrame(renderHighlights), { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(renderHighlights));
}

function sendWs(data) {
  chrome.runtime.sendMessage({ source: 'content', type: 'ws-send', roomId: STATE.roomId, data });
}

function handleBgMessage(message) {
  if (message?.source !== 'bg') return;
  const { payload } = message;
  if (payload?.type === 'state') {
    STATE.highlights.clear();
    for (const hl of payload.highlights || []) STATE.highlights.set(hl.id, hl);
    renderHighlights();
  } else if (payload?.type === 'add') {
    const hl = payload.highlight;
    STATE.highlights.set(hl.id, hl);
    renderHighlights();
  } else if (payload?.type === 'remove') {
    STATE.highlights.delete(payload.highlightId);
    renderHighlights();
  }
}

async function boot() {
  STATE.roomId = getRoomIdFromUrl();
  if (!STATE.roomId) return;
  initOverlay();
  buildFileIndex();
  observeLayoutChanges();
  setupInteractions();
  chrome.runtime.onMessage.addListener(handleBgMessage);
  chrome.runtime.sendMessage({ source: 'content', type: 'hello', roomId: STATE.roomId }, () => {});
}

boot();

