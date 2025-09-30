// Shared types between extension and backend

export interface Highlight {
  id: string;
  prUrl: string;
  fileName: string;
  lineNumber: number;
  userId: string;
  username: string;
  color: string;
  timestamp: Date;
  content?: string;
}

export interface User {
  id: string;
  githubId: string;
  username: string;
  avatar: string;
  color: string;
}

export interface PRSession {
  prUrl: string;
  users: User[];
  highlights: Highlight[];
}

export interface SocketEvents {
  // Client to server
  'join-pr': { prUrl: string; user: User };
  'leave-pr': { prUrl: string; userId: string };
  'create-highlight': Omit<Highlight, 'id' | 'timestamp'>;
  'delete-highlight': { highlightId: string; userId: string };
  'update-highlight': { highlightId: string; changes: Partial<Highlight>; userId: string };
  
  // Server to client
  'user-joined': { user: User };
  'user-left': { userId: string };
  'highlight-created': { highlight: Highlight };
  'highlight-deleted': { highlightId: string };
  'highlight-updated': { highlightId: string; changes: Partial<Highlight> };
  'highlights-sync': { highlights: Highlight[] };
  'error': { message: string };
}

export interface GitHubLineElement {
  element: HTMLElement;
  lineNumber: number;
  fileName: string;
  bounds: DOMRect;
}

export interface HighlightOverlay {
  id: string;
  element: HTMLElement;
  highlight: Highlight;
}