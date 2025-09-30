import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [color, setColor] = React.useState<string>('#ffd54f');
  const [status, setStatus] = React.useState<string>('disconnected');
  const [users, setUsers] = React.useState<{ login: string, color: string }[]>([]);

  React.useEffect(() => {
    (chrome as any).storage?.local?.get(['crh_color']).then((res: any) => {
      if (res && res.crh_color) setColor(res.crh_color);
    });
  }, []);

  function saveColor(next: string) {
    setColor(next);
    (chrome as any).storage?.local?.set({ crh_color: next });
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 12, width: 280 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Code Review Highlight</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div>Color</div>
        <input type="color" value={color} onChange={(e) => saveColor(e.target.value)} />
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Status: {status}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Active users</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {users.map((u, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <div style={{ width: 10, height: 10, background: u.color, borderRadius: 999 }} />
              <div>{u.login}</div>
            </div>
          ))}
          {users.length === 0 && <div style={{ fontSize: 12, color: '#888' }}>No one else here</div>}
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

