# Realtime Server

Simple Node.js WebSocket server managing PR-scoped rooms for highlights.

## Run

```bash
npm install
npm start
```

Env:
- `PORT` default 8787

## Protocol

Messages are JSON with a `type` field. See `/workspace/docs/IMPLEMENTATION_PLAN.md` for details.

