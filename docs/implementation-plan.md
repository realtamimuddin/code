## Project: GitHub PR Real-time Code Review Highlights

### Architecture Decisions
- Real-time transport: Start with a first-party Node.js WebSocket server using `ws`. Abstract via a `RealtimeTransport` interface in the extension background to enable swapping to Ably/Pusher or Liveblocks/PartyKit later without touching content/UI.
- Persistence: Phase 1 uses in-memory room state on the server (for fast iteration). Phase 2 adds Redis for persistence and cross-instance fan-out (via pub/sub). Phase 3 can switch to Supabase for managed storage and Row Level Security.
- Identity: Phase 1 ships with a lightweight anonymous identity (client-generated ULID) for dev/testing. Phase 2 integrates GitHub OAuth via `chrome.identity.launchWebAuthFlow` + server OAuth callback. Tokens stored in `chrome.storage` (scoped, not sync) and never sent to third parties. Presence shows avatar if available.
- Conflict resolution: Use a Last-Writer-Wins (LWW) register per highlight with a version of `(timestampMs, clientCounter, clientId)`. Ties break lexicographically by `clientId`. Server maintains a per-room lamport clock to bump on write; clients include their local counter for idempotency; server applies LWW and broadcasts authoritative state.
- State model: Room keyed by PR identifier: `gh://{owner}/{repo}/pull/{number}`. Each room holds a map of `highlightId -> Highlight`. A `Highlight` is immutable except color and range; removal is represented as a tombstone broadcast.
- Overlay: Content script injects an absolutely positioned overlay container and individual highlight blocks aligned to GitHub line rows. It observes scroll/resize and DOM mutations (expands/collapses) and lazy-renders only visible file blocks.

### Data Model (initial)
- Highlight
  - id: string (ULID)
  - roomId: string (PR room key)
  - filePath: string (relative path in repo)
  - side: 'left' | 'right' | 'unified' | undefined
  - lineStart: number
  - lineEnd: number (inclusive)
  - color: string (hex or rgba)
  - author: { userId: string; username?: string; avatarUrl?: string }
  - version: { ts: number; counter: number; clientId: string }
  - createdAt: number (epoch ms)

### Protocol (client ↔ server)
- join: { type: 'join', roomId, clientId, user }
- state: { type: 'state', roomId, highlights: Highlight[] }
- add: { type: 'add', roomId, highlight: Highlight }
- remove: { type: 'remove', roomId, highlightId: string, version }
- presence: { type: 'presence', roomId, users: User[] }
- ping/pong for liveness

### Extension Runtime Flows
1) Content boot:
   - Derive roomId from URL; send HELLO to background with roomId and page metadata.
   - Initialize OverlayEngine; attach listeners for scroll/resize/DOM changes.
2) Background room management:
   - Maintain one WebSocket per roomId; track attached tabIds. Lazy-connect on first tab join; disconnect when last tab leaves.
   - On WS open → send join. On messages → broadcast to tabs. On tab messages → forward to WS (add/remove).
3) Highlight creation:
   - User Shift+Clicks a line number gutter → content computes `{filePath, lineNumber}` and sends ADD to background.
   - Background wraps with `highlightId`, `version`, `clientId` and forwards to server.
   - Server applies LWW, broadcasts `added`. Content renders.
4) Resync:
   - On reconnect or new tab → background requests/receives `state` then forwards to content which reconciles overlay.

### Performance
- Lazy render: Only compute overlay elements for files intersecting the viewport (IntersectionObserver per file block).
- Batch DOM writes: Use `requestAnimationFrame` to coalesce highlight reflows.
- Minimal observers: One MutationObserver per `#files` container to handle expand/collapse.

### Security & Privacy
- WSS/HTTPS only in production; local dev uses ws://localhost.
- OAuth tokens only stored in `chrome.storage.local` and sent exclusively to the extension backend over HTTPS.
- Room admission policy (Phase 2): server verifies GitHub access to repo for joining users (via short-lived token introspection) to ensure repos remain private.

### Phases
- Phase 0: Scaffolding (extension MV3 + background + content; Node ws server)
- Phase 1: Overlay MVP (click-to-highlight, render, resync)
- Phase 2: Presence + avatars; color picker in popup (React via Vite)
- Phase 3: Persistence (Redis) + scale out; reconnect with backoff; auth integration
- Phase 4: Swap transport (Ably/Liveblocks) via pluggable `RealtimeTransport`

### Risks
- GitHub DOM churn: mitigate with layered selectors and graceful fallbacks.
- Service worker lifecycle: ensure reconnection and tab re-association after idle.
- Cross-browser parity: MV3 now supported in Chrome/Edge; Firefox MV3 support is rolling out—fallback to MV2 manifest if needed in a separate build profile.

