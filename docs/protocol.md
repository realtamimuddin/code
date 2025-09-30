## Message Protocol and LWW CRDT

All messages are JSON objects with a `type` field. Rooms are identified by `roomId` of the format `gh://{owner}/{repo}/pull/{number}`.

### Messages
- join: `{ type: 'join', roomId, clientId, user? }`
- state: `{ type: 'state', roomId, highlights: Highlight[] }`
- add: `{ type: 'add', roomId, highlight: Highlight }`
- remove: `{ type: 'remove', roomId, highlightId: string, version: Version }`
- presence: `{ type: 'presence', roomId, users: User[] }`
- ping/pong: liveness

### Types
- Version: `{ ts: number, counter: number, clientId: string }`
- Highlight:
```
{
  id: string,
  roomId: string,
  filePath: string,
  side?: 'left'|'right'|'unified',
  lineStart: number,
  lineEnd: number,
  color: string,
  author: { userId: string, username?: string, avatarUrl?: string },
  version: Version,
  createdAt: number
}
```

### LWW Rules
- Each highlight is stored as the value of an LWW register keyed by `id`.
- For `add` (upsert): Replace if incoming `version` is greater by the comparator `(ts, counter, clientId)` lexicographic.
- For `remove`: Remove if incoming `version` is greater-or-equal than existing.
- Comparator:
```
if (a.ts !== b.ts) return a.ts - b.ts
if (a.counter !== b.counter) return a.counter - b.counter
return a.clientId.localeCompare(b.clientId)
```

