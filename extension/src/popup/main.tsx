import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [color, setColor] = useState('#f9d423');

  useEffect(() => {
    chrome.storage?.local?.get?.(['highlightColor']).then((v) => {
      if (v?.highlightColor) setColor(v.highlightColor);
    });
  }, []);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setColor(next);
    chrome.storage?.local?.set?.({ highlightColor: next });
  }

  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ margin: '4px 0 12px' }}>Code Review Highlight</h3>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Highlight color</span>
        <input type="color" value={color} onChange={onChange} />
      </label>
      <p style={{ color: '#666', fontSize: 12, marginTop: 12 }}>
        Configure highlight color. Open a GitHub PR page to use.
      </p>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

