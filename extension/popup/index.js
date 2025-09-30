const colorEl = document.getElementById('color');
const saveEl = document.getElementById('save');
const usersEl = document.getElementById('users');

async function load() {
  const { highlightColor } = await chrome.storage.local.get('highlightColor');
  if (highlightColor) colorEl.value = highlightColor;
}

saveEl.addEventListener('click', async () => {
  await chrome.storage.local.set({ highlightColor: colorEl.value });
  window.close();
});

load();

