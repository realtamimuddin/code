import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [color, setColor] = useState("rgba(255, 235, 59, 0.35)");

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_HIGHLIGHT_COLOR" }, (resp) => {
      if (resp?.color) setColor(resp.color);
    });
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setColor(v);
    chrome.runtime.sendMessage({ type: "SET_HIGHLIGHT_COLOR", color: v });
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="row">
        <div className="grow">
          <div style={{ fontWeight: 600 }}>Highlight color</div>
          <div className="muted">CSS color (e.g. rgba(255,235,59,0.35) or #ffeb3b55)</div>
        </div>
        <input style={{ width: 140 }} value={color} onChange={onChange} />
      </div>
      <div className="row">
        <button onClick={() => chrome.tabs.create({ url: "https://github.com" })}>Open GitHub</button>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

