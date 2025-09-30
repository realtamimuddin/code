# Code Review Highlight Extension - Implementation Plan

## Architecture Overview

### Core Components
1. **Browser Extension** (Chrome/Firefox compatible)
   - Content Script: Injects overlay and handles DOM manipulation
   - Background Script: Manages authentication and communication
   - Popup UI: User controls and settings
   - Options Page: Configuration and preferences

2. **Real-time Backend**
   - WebSocket server for real-time communication
   - Redis for fast state management and pub/sub
   - PostgreSQL for persistent storage
   - GitHub OAuth integration

3. **Data Flow**
   - GitHub PR → Content Script → WebSocket → Backend → Redis/DB
   - Real-time sync via WebSocket pub/sub model

## Technical Decisions

### Frontend Stack
- **React** with TypeScript for popup/options UI (mature ecosystem, good extension support)
- **Vanilla TypeScript** for content script (minimal footprint, direct DOM access)
- **Tailwind CSS** for styling (utility-first, small bundle)

### Backend Stack
- **Node.js + Express** with TypeScript
- **Socket.io** for WebSocket management (handles reconnection, fallbacks)
- **Redis** for real-time state and pub/sub
- **PostgreSQL** with Prisma ORM for persistent data
- **GitHub OAuth** via GitHub Apps API

### Real-time Architecture
- **Socket.io** chosen over alternatives for:
  - Built-in reconnection logic
  - Room-based pub/sub model
  - Fallback transport options
  - Excellent browser support

### Conflict Resolution Strategy
- **Last-Writer-Wins with Timestamps** (simple, effective for highlighting)
- **Operational Transform** for complex cases (future enhancement)

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Browser extension manifest and basic structure
- [ ] Content script DOM injection system
- [ ] Basic WebSocket server setup
- [ ] GitHub OAuth flow

### Phase 2: Highlighting Engine (Week 2)
- [ ] Code line detection and overlay rendering
- [ ] Highlight creation/deletion UI
- [ ] Real-time sync of highlights
- [ ] Basic conflict resolution

### Phase 3: Advanced Features (Week 3)
- [ ] User avatars and hover information
- [ ] Color coding and user preferences
- [ ] Performance optimizations
- [ ] Error handling and reconnection

### Phase 4: Polish & Deploy (Week 4)
- [ ] Security hardening
- [ ] Extension store submission
- [ ] Documentation and setup guides
- [ ] Testing and bug fixes

## Data Models

### Highlight Schema
```typescript
interface Highlight {
  id: string;
  prUrl: string;
  fileName: string;
  lineNumber: number;
  userId: string;
  color: string;
  timestamp: Date;
  content?: string; // Optional comment
}

interface User {
  id: string;
  githubId: string;
  username: string;
  avatar: string;
  accessToken: string; // Encrypted
}
```

## Security Considerations
- OAuth tokens stored in chrome.storage.local (encrypted)
- WSS-only communication
- Repository access validation via GitHub API
- Rate limiting on WebSocket connections
- Input sanitization for all user data

## Performance Requirements
- < 100ms highlight creation latency
- < 500ms real-time sync latency
- < 5% impact on GitHub page load time
- Graceful degradation for slow connections