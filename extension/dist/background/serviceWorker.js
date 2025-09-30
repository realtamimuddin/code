// src/background/serviceWorker.ts
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ highlightColor: "rgba(255, 235, 59, 0.35)" }, (data) => {
    if (!data.highlightColor) {
      chrome.storage.sync.set({ highlightColor: "rgba(255, 235, 59, 0.35)" });
    }
  });
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_HIGHLIGHT_COLOR") {
    chrome.storage.sync.get({ highlightColor: "rgba(255, 235, 59, 0.35)" }, (data) => {
      sendResponse({ color: data.highlightColor });
    });
    return true;
  }
  if (message?.type === "SET_HIGHLIGHT_COLOR") {
    if (typeof message.color === "string") {
      chrome.storage.sync.set({ highlightColor: message.color }, () => {
        sendResponse({ ok: true });
      });
      return true;
    }
  }
});
