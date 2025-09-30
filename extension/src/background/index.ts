// Background service worker (MV3, ESM)
// Handles long-lived connections, auth state, and relays messages if needed.

chrome.runtime.onInstalled.addListener(() => {
  // Initialize defaults
  chrome.storage.local.get(['highlightColor', 'wsUrl']).then((vals) => {
    const next: Record<string, unknown> = {};
    if (!vals.highlightColor) next.highlightColor = '#f9d423';
    if (!vals.wsUrl) next.wsUrl = 'ws://localhost:8787';
    if (Object.keys(next).length) chrome.storage.local.set(next).catch(() => {});
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Relay messages to content scripts in the active tab if needed
  if (message?.type === 'PING') {
    sendResponse({ ok: true });
  }
  // Return true only if we will respond asynchronously
  return false;
});

