## Project: Real-time Code Review Highlight (GitHub Overlay)

### Goals
- Deliver a browser extension that overlays collaborative line highlights on GitHub PR pages.
- Provide sub-500ms real-time sync across users with basic CRDT conflict handling and persistence.

### Architecture Overview
- Extension (MV3):
  - Background service worker: room and WebSocket connection management, auth token storage.
  - Content script: overlay injection, line mapping, DOM observation, user interaction.
  - Popup UI (React): color selection, presence list, connection status.
- Realtime backend: Node.js + ws, room-based channels keyed by PR, CRDT(OR-Set) for highlights.
- Persistence: In-memory default with optional Redis adapter. Pluggable provider interface to later swap to Supabase.
- Auth: GitHub OAuth via extension (chrome.identity) or external OAuth page. Server trusts bearer tokens and maps to GitHub identity. For scaffold, stub user identity locally.

### Key Identifiers
- PR key: `<host>:<owner>/<repo>#<prNumber>` (e.g., `github.com:vercel/next.js#54321`).
- Highlight id: `uuid-v4` generated client-side.
- File identity: path from file header in PR diff DOM.

### Data Model (initial)
- Highlight
  - id: string
  - prKey: string
  - filePath: string
  - startLine: number
  - endLine: number (inclusive)
  - color: string (hex)
  - author: { id: string, login: string, avatarUrl?: string }
  - timestamp: number (ms since epoch)
  - tombstone?: boolean (for OR-Set remove)
- Presence
  - user: { id, login, avatarUrl }
  - color: string
  - lastSeen: number

### Real-time Protocol (WebSocket JSON messages)
- Client -> Server
  - `join`: { prKey, user, color }
  - `highlight.add`: { prKey, highlight }
  - `highlight.remove`: { prKey, id }
  - `resync.request`: { prKey, sinceVersion? }
- Server -> Client
  - `state.full`: { prKey, highlights: Highlight[], version: number }
  - `presence.update`: { prKey, users: Presence[] }
  - `highlight.applied`: { prKey, highlight }
  - `highlight.removed`: { prKey, id }
  - `error`: { code, message }

### CRDT/Conflict Strategy (pragmatic)
- Use OR-Set for highlights keyed by `id`.
- For “same line” collisions by different users:
  - Both highlights coexist; renderer stacks them with slight vertical offsets.
  - Optional merge heuristic: if same `filePath` and identical range and color, deduplicate by choosing lowest `id` lexicographically.

### Performance & Robustness
- Lazy render: only draw highlights for files in or near viewport.
- MutationObserver watches file expand/collapse; virtual scroller recalculates positions.
- Debounced layout recomputation on resize/scroll.
- Background maintains per-PR WebSocket with exponential backoff.

### Security & Privacy
- All traffic WSS; server behind TLS terminator/reverse-proxy.
- OAuth tokens stored with `chrome.identity` or `browser.identity` and never sent to other clients.
- Server validates repo membership before joining rooms (stubbed in scaffold; add GitHub API check later).

### Phases
1) Scaffold real-time server and in-memory OR-Set store.
2) Scaffold MV3 extension with React popup; background socket manager; content overlay engine.
3) Wire content <-> background messaging and basic highlight add/remove.
4) Add Redis persistence and resume on reconnect.
5) Implement OAuth and server-side access checks.
6) Optimize renderer (virtualization, batching) and add presence UI.
7) Ship docs and setup guides.

### External Services Setup (initial plan)
- Redis (optional): provision managed Redis; supply `REDIS_URL` and `REDIS_TLS=true` if needed.
- TLS: place ws server behind Nginx/Caddy or use Fly.io/Render with TLS termination.
- OAuth: register GitHub OAuth App for extension; record `client_id`, `client_secret`. Use device flow or `chrome.identity.launchWebAuthFlow`.

### Risks & Mitigations
- GitHub DOM changes: target robust selectors; fallback to manual line number parsing; maintain a small DOM adapter.
- Extension perf: use pointer-events layering and only render when visible; microtask-batch DOM writes.
- Real-time fanout: shard rooms by key; move to Ably/Liveblocks if growth requires managed infra.

