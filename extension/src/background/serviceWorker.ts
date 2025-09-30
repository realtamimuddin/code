chrome.runtime.onInstalled.addListener(() => {
  // Ensure default color exists
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

// Placeholder for GitHub OAuth web auth flow
async function launchGithubOAuth(): Promise<void> {
  const clientId = "REPLACE_WITH_CLIENT_ID";
  const redirectUri = chrome.identity.getRedirectURL("oauth2");
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      // The server should handle code exchange
      resolve();
    });
  });
}
