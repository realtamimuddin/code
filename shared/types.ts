// Shared TypeScript types and interfaces

export interface HighlightData {
  id: string;
  prUrl: string;
  filePath: string;
  lineNumber: number;
  userId: string;
  userName: string;
  userAvatar: string;
  color: string;
  timestamp: number;
  text?: string; // Optional comment
}

export interface User {
  id: string;
  login: string;
  name: string;
  avatar_url: string;
  accessToken: string;
}

export interface PRInfo {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

export interface GitHubLineElement {
  element: HTMLElement;
  lineNumber: number;
  filePath: string;
  bounds: DOMRect;
}

export interface HighlightLayer {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  highlights: Map<string, HighlightData>;
}

export interface RealtimeMessage {
  type: 'highlight_added' | 'highlight_removed' | 'user_joined' | 'user_left' | 'cursor_moved';
  data: any;
  userId: string;
  timestamp: number;
}

export interface ConnectionState {
  connected: boolean;
  room: string;
  users: User[];
  reconnectAttempts: number;
}

// GitHub DOM selector configurations with fallbacks
export interface GitHubSelectors {
  version: string;
  selectors: {
    filesContainer: string[];
    codeLines: string[];
    lineNumbers: string[];
    diffLines: string[];
    fileHeaders: string[];
  };
}

export const GITHUB_SELECTORS: GitHubSelectors = {
  version: "2024",
  selectors: {
    filesContainer: [
      "#files",
      ".js-diff-progressive-container", 
      "[data-target='diff-progressive-container']"
    ],
    codeLines: [
      ".js-file-line",
      "tr.js-file-line",
      "[data-line-number]",
      ".blob-code-inner"
    ],
    lineNumbers: [
      ".js-line-number",
      "[data-line-number]",
      ".blob-num"
    ],
    diffLines: [
      ".js-file-line.js-file-line-added",
      ".js-file-line.js-file-line-removed", 
      "[data-diff-line-type]"
    ],
    fileHeaders: [
      ".file-header",
      "[data-anchor]",
      ".js-file-header"
    ]
  }
};