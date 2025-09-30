import { GitHubOverlayManager } from './github-overlay';
import { SocketManager } from './socket-manager';
import { AuthManager } from '../utils/auth-manager';
import { Highlight, User } from '../../../shared/types';

class ContentScript {
  private overlayManager: GitHubOverlayManager;
  private socketManager: SocketManager;
  private authManager: AuthManager;
  private currentUser: User | null = null;
  private currentPR: string | null = null;

  constructor() {
    this.authManager = new AuthManager();
    this.overlayManager = new GitHubOverlayManager();
    this.socketManager = new SocketManager();
    
    this.init();
  }

  private async init() {
    try {
      // Check if we're on a PR page
      if (!this.isPullRequestPage()) {
        return;
      }

      // Get current user
      this.currentUser = await this.authManager.getCurrentUser();
      if (!this.currentUser) {
        console.log('User not authenticated');
        return;
      }

      // Extract PR URL
      this.currentPR = window.location.href;

      // Initialize overlay manager
      await this.overlayManager.initialize();

      // Setup socket connection
      await this.socketManager.connect();
      this.setupSocketListeners();

      // Join PR session
      await this.socketManager.joinPR(this.currentPR, this.currentUser);

      // Setup UI event listeners
      this.setupUIListeners();

      console.log('Code Review Highlights extension initialized');
    } catch (error) {
      console.error('Failed to initialize extension:', error);
    }
  }

  private isPullRequestPage(): boolean {
    return /\/pull\/\d+/.test(window.location.pathname);
  }

  private setupSocketListeners() {
    this.socketManager.on('highlight-created', (highlight: Highlight) => {
      this.overlayManager.addHighlight(highlight);
    });

    this.socketManager.on('highlight-deleted', (highlightId: string) => {
      this.overlayManager.removeHighlight(highlightId);
    });

    this.socketManager.on('highlights-sync', (highlights: Highlight[]) => {
      this.overlayManager.syncHighlights(highlights);
    });

    this.socketManager.on('user-joined', (user: User) => {
      this.showUserNotification(`${user.username} joined`, 'info');
    });

    this.socketManager.on('user-left', (userId: string) => {
      // Handle user leaving
    });
  }

  private setupUIListeners() {
    // Listen for line selections
    document.addEventListener('mouseup', (event) => {
      this.handleSelection(event);
    });

    // Listen for keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.key === 'h') {
        event.preventDefault();
        this.toggleHighlightMode();
      }
    });

    // Handle GitHub navigation (SPA)
    this.observeUrlChanges();
  }

  private async handleSelection(event: MouseEvent) {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === '') {
      return;
    }

    const lineInfo = this.overlayManager.getLineInfoFromSelection(selection);
    if (!lineInfo) {
      return;
    }

    // Create highlight
    if (this.currentUser && this.currentPR) {
      const highlight: Omit<Highlight, 'id' | 'timestamp'> = {
        prUrl: this.currentPR,
        fileName: lineInfo.fileName,
        lineNumber: lineInfo.lineNumber,
        userId: this.currentUser.id,
        username: this.currentUser.username,
        color: this.currentUser.color,
        content: selection.toString()
      };

      await this.socketManager.createHighlight(highlight);
    }

    // Clear selection
    selection.removeAllRanges();
  }

  private toggleHighlightMode() {
    this.overlayManager.toggleHighlightMode();
  }

  private observeUrlChanges() {
    let currentUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        this.handleUrlChange();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private async handleUrlChange() {
    if (this.isPullRequestPage()) {
      const newPR = window.location.href;
      if (newPR !== this.currentPR) {
        // Leave current PR
        if (this.currentPR && this.currentUser) {
          await this.socketManager.leavePR(this.currentPR, this.currentUser.id);
        }
        
        // Join new PR
        this.currentPR = newPR;
        if (this.currentUser) {
          await this.socketManager.joinPR(this.currentPR, this.currentUser);
        }
        
        // Reset overlay
        this.overlayManager.reset();
      }
    } else {
      // Left PR page
      if (this.currentPR && this.currentUser) {
        await this.socketManager.leavePR(this.currentPR, this.currentUser.id);
        this.currentPR = null;
        this.overlayManager.reset();
      }
    }
  }

  private showUserNotification(message: string, type: 'info' | 'error') {
    // Create toast notification
    const notification = document.createElement('div');
    notification.className = `crh-notification crh-notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize content script
new ContentScript();