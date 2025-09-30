const input = document.getElementById('serverUrl');
const saveBtn = document.getElementById('save');

async function load() {
  const { serverUrl } = await chrome.storage.local.get('serverUrl');
  input.value = serverUrl || 'http://localhost:8787';
}

saveBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ serverUrl: input.value.trim() });
  alert('Saved');
});

load();

