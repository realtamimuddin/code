import { RealtimeClient, type HighlightMessage } from '../lib/realtime';
import { createOverlay } from './overlay';
import { getPullRequestKey, mapLineElements } from './mapping';

let WS_URL_DEFAULT = 'ws://localhost:8787';

let realtime: RealtimeClient | null = null;

async function bootstrap() {
  const prKey = getPullRequestKey(location.href);
  if (!prKey) return;

  const overlay = createOverlay();
  document.documentElement.appendChild(overlay.root);

  const { getViewportHighlights, setHighlight, removeHighlight, clearHighlights } = overlay.api;

  function syncLayout() {
    const mapping = mapLineElements();
    overlay.api.updateLayout(mapping);
  }

  const resizeObserver = new ResizeObserver(() => syncLayout());
  resizeObserver.observe(document.documentElement);
  window.addEventListener('scroll', syncLayout, { passive: true });
  const mutationObserver = new MutationObserver(() => syncLayout());
  mutationObserver.observe(document.body, { subtree: true, childList: true, attributes: true });

  const stored = await chrome.storage?.local?.get?.(['highlightColor', 'wsUrl']).catch(() => ({} as any)) as any;
  const color = stored?.highlightColor || '#f9d423';
  const wsUrl = stored?.wsUrl || WS_URL_DEFAULT;

  realtime = new RealtimeClient(wsUrl);
  realtime.connect(prKey);

  realtime.on('highlight:add', (msg: HighlightMessage) => {
    setHighlight(msg.lineKey, msg.user, msg.color, msg.timestamp);
  });
  realtime.on('highlight:remove', (msg: HighlightMessage) => {
    removeHighlight(msg.lineKey, msg.user, msg.timestamp);
  });
  realtime.on('sync:state', (state) => {
    clearHighlights();
    for (const item of state) {
      setHighlight(item.lineKey, item.user, item.color, item.timestamp);
    }
  });

  // User interaction: click line to toggle highlight
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const lineKey = target?.closest('[data-line-key]')?.getAttribute('data-line-key');
    if (!lineKey) return;
    e.preventDefault();
    const existing = getViewportHighlights().find((h) => h.lineKey === lineKey && h.user === 'me');
    const payload: HighlightMessage = {
      type: existing ? 'highlight:remove' : 'highlight:add',
      prKey,
      lineKey,
      user: 'me',
      color,
      timestamp: Date.now()
    };
    realtime?.send(payload);
  }, true);

  syncLayout();
}

bootstrap().catch(() => {});

