/**
 * GitHub Code Review Highlight - Content Script
 * Handles DOM injection, overlay management, and real-time sync
 */

class GitHubHighlightInjector {
  constructor() {
    this.highlights = new Map();
    this.overlayCanvas = null;
    this.overlayContext = null;
    this.websocket = null;
    this.currentPR = null;
    this.user = null;
    this.isInitialized = false;
    this.observers = [];
    this.resizeObserver = null;
    
    // GitHub DOM selectors with fallbacks
    this.selectors = {
      filesContainer: ['#files', '.js-diff-progressive-container', '[data-target="diff-progressive-container"]'],
      codeLines: ['.js-file-line', 'tr.js-file-line', '[data-line-number]', '.blob-code-inner'],
      lineNumbers: ['.js-line-number', '[data-line-number]', '.blob-num'],
      diffLines: ['.js-file-line.js-file-line-added', '.js-file-line.js-file-line-removed', '[data-diff-line-type]'],
      fileHeaders: ['.file-header', '[data-anchor]', '.js-file-header']
    };
    
    this.init();
  }

  async init() {
    console.log('🎨 Code Review Highlight: Initializing...');
    
    try {
      // Wait for GitHub page to be ready
      await this.waitForGitHubReady();
      
      // Extract PR information
      this.currentPR = this.extractPRInfo();
      if (!this.currentPR) {
        console.log('❌ Not a valid PR page');
        return;
      }
      
      console.log('📄 PR detected:', this.currentPR);
      
      // Get user authentication
      this.user = await this.getAuthenticatedUser();
      if (!this.user) {
        console.log('🔐 User not authenticated');
        return;
      }
      
      // Initialize overlay system
      await this.initializeOverlay();
      
      // Connect to real-time sync
      await this.connectToRealtimeSync();
      
      // Setup DOM observers
      this.setupDOMObservers();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      console.log('✅ Code Review Highlight: Initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Code Review Highlight:', error);
    }
  }

  async waitForGitHubReady() {
    return new Promise((resolve) => {
      const checkReady = () => {
        const filesContainer = this.findElement(this.selectors.filesContainer);
        if (filesContainer && document.readyState === 'complete') {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }

  extractPRInfo() {
    const match = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
    if (!match) return null;
    
    return {
      owner: match[1],
      repo: match[2],
      number: parseInt(match[3]),
      url: window.location.href.split('#')[0] // Remove fragment
    };
  }

  async getAuthenticatedUser() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_USER' }, (response) => {
        resolve(response?.user || null);
      });
    });
  }

  async initializeOverlay() {
    const filesContainer = this.findElement(this.selectors.filesContainer);
    if (!filesContainer) {
      throw new Error('Could not find files container');
    }

    // Create overlay canvas
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.id = 'crh-overlay-canvas';
    this.overlayCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 1000;
      opacity: 0.7;
    `;
    
    this.overlayContext = this.overlayCanvas.getContext('2d');
    
    // Insert canvas into DOM
    filesContainer.style.position = 'relative';
    filesContainer.appendChild(this.overlayCanvas);
    
    // Setup resize handling
    this.setupResizeHandling();
    
    // Initial render
    this.updateCanvasSize();
    this.renderHighlights();
  }

  setupResizeHandling() {
    // Handle window resize
    window.addEventListener('resize', () => this.updateCanvasSize());
    
    // Handle dynamic content changes
    this.resizeObserver = new ResizeObserver(() => {
      this.updateCanvasSize();
      this.renderHighlights();
    });
    
    const filesContainer = this.findElement(this.selectors.filesContainer);
    if (filesContainer) {
      this.resizeObserver.observe(filesContainer);
    }
  }

  updateCanvasSize() {
    const filesContainer = this.findElement(this.selectors.filesContainer);
    if (!filesContainer || !this.overlayCanvas) return;
    
    const rect = filesContainer.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    this.overlayCanvas.width = rect.width;
    this.overlayCanvas.height = rect.height;
    this.overlayCanvas.style.width = rect.width + 'px';
    this.overlayCanvas.style.height = rect.height + 'px';
    this.overlayCanvas.style.top = (rect.top + scrollTop) + 'px';
    this.overlayCanvas.style.left = (rect.left + scrollLeft) + 'px';
  }

  setupDOMObservers() {
    // Observe file expansions/collapses
    const observer = new MutationObserver((mutations) => {
      let shouldRerender = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' || 
            mutation.type === 'attributes' && 
            (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
          shouldRerender = true;
        }
      });
      
      if (shouldRerender) {
        setTimeout(() => {
          this.updateCanvasSize();
          this.renderHighlights();
        }, 100);
      }
    });
    
    const filesContainer = this.findElement(this.selectors.filesContainer);
    if (filesContainer) {
      observer.observe(filesContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
      this.observers.push(observer);
    }
  }

  setupEventListeners() {
    // Handle click events for creating highlights
    document.addEventListener('click', (event) => {
      if (!this.isInitialized || event.ctrlKey || event.metaKey) return;
      
      const lineElement = this.findLineElement(event.target);
      if (lineElement) {
        event.preventDefault();
        this.handleLineClick(lineElement, event);
      }
    });
    
    // Handle scroll events
    window.addEventListener('scroll', () => {
      this.updateCanvasSize();
    });
    
    // Handle keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.clearSelection();
      }
    });
  }

  findElement(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  findLineElement(target) {
    let current = target;
    while (current && current !== document.body) {
      for (const selector of this.selectors.codeLines) {
        if (current.matches && current.matches(selector)) {
          return current;
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  getLineInfo(lineElement) {
    // Extract line number
    let lineNumber = null;
    const lineNumberElement = lineElement.querySelector(this.selectors.lineNumbers.join(',')) ||
                             lineElement.previousElementSibling?.querySelector(this.selectors.lineNumbers.join(','));
    
    if (lineNumberElement) {
      lineNumber = parseInt(lineNumberElement.textContent) || 
                  parseInt(lineNumberElement.getAttribute('data-line-number'));
    }
    
    // Extract file path
    let filePath = null;
    let current = lineElement;
    while (current && !filePath) {
      const fileHeader = current.querySelector(this.selectors.fileHeaders.join(','));
      if (fileHeader) {
        const anchor = fileHeader.querySelector('[data-anchor]');
        filePath = anchor ? anchor.getAttribute('data-anchor') : null;
      }
      current = current.parentElement;
    }
    
    return { lineNumber, filePath };
  }

  handleLineClick(lineElement, event) {
    const lineInfo = this.getLineInfo(lineElement);
    if (!lineInfo.lineNumber || !lineInfo.filePath) {
      console.warn('Could not extract line information');
      return;
    }
    
    const highlightId = `${lineInfo.filePath}:${lineInfo.lineNumber}`;
    
    if (this.highlights.has(highlightId)) {
      // Remove existing highlight
      this.removeHighlight(highlightId);
    } else {
      // Create new highlight
      this.createHighlight(lineInfo, event);
    }
  }

  createHighlight(lineInfo, event) {
    const highlight = {
      id: `${lineInfo.filePath}:${lineInfo.lineNumber}`,
      prUrl: this.currentPR.url,
      filePath: lineInfo.filePath,
      lineNumber: lineInfo.lineNumber,
      userId: this.user.id,
      userName: this.user.login,
      userAvatar: this.user.avatar_url,
      color: this.getRandomColor(),
      timestamp: Date.now()
    };
    
    this.highlights.set(highlight.id, highlight);
    this.renderHighlights();
    
    // Send to real-time sync
    this.sendRealtimeMessage({
      type: 'highlight_added',
      data: highlight,
      userId: this.user.id,
      timestamp: Date.now()
    });
  }

  removeHighlight(highlightId) {
    this.highlights.delete(highlightId);
    this.renderHighlights();
    
    // Send to real-time sync
    this.sendRealtimeMessage({
      type: 'highlight_removed',
      data: { id: highlightId },
      userId: this.user.id,
      timestamp: Date.now()
    });
  }

  renderHighlights() {
    if (!this.overlayContext || !this.overlayCanvas) return;
    
    // Clear canvas
    this.overlayContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    
    // Render each highlight
    for (const highlight of this.highlights.values()) {
      this.renderHighlight(highlight);
    }
  }

  renderHighlight(highlight) {
    // Find the line element
    const lineElement = this.findLineElementByPath(highlight.filePath, highlight.lineNumber);
    if (!lineElement) return;
    
    const filesContainer = this.findElement(this.selectors.filesContainer);
    if (!filesContainer) return;
    
    const containerRect = filesContainer.getBoundingClientRect();
    const lineRect = lineElement.getBoundingClientRect();
    
    // Calculate relative position
    const x = lineRect.left - containerRect.left;
    const y = lineRect.top - containerRect.top;
    const width = lineRect.width;
    const height = lineRect.height;
    
    // Draw highlight
    this.overlayContext.fillStyle = highlight.color + '40'; // Add transparency
    this.overlayContext.fillRect(x, y, width, height);
    
    // Draw border
    this.overlayContext.strokeStyle = highlight.color;
    this.overlayContext.lineWidth = 2;
    this.overlayContext.strokeRect(x, y, width, height);
  }

  findLineElementByPath(filePath, lineNumber) {
    // This is a simplified implementation
    // In practice, you'd need more sophisticated logic to find the exact line
    const codeLines = document.querySelectorAll(this.selectors.codeLines.join(','));
    
    for (const line of codeLines) {
      const lineInfo = this.getLineInfo(line);
      if (lineInfo.filePath === filePath && lineInfo.lineNumber === lineNumber) {
        return line;
      }
    }
    
    return null;
  }

  getRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Real-time sync methods
  async connectToRealtimeSync() {
    const room = `pr-${this.currentPR.owner}-${this.currentPR.repo}-${this.currentPR.number}`;
    const wsUrl = `wss://your-partykit-server.partykit.dev/party/${room}`;
    
    this.websocket = new WebSocket(wsUrl);
    
    this.websocket.onopen = () => {
      console.log('🔗 Connected to real-time sync');
      this.sendRealtimeMessage({
        type: 'user_joined',
        data: this.user,
        userId: this.user.id,
        timestamp: Date.now()
      });
    };
    
    this.websocket.onmessage = (event) => {
      this.handleRealtimeMessage(JSON.parse(event.data));
    };
    
    this.websocket.onclose = () => {
      console.log('🔌 Disconnected from real-time sync');
      // Implement reconnection logic
      setTimeout(() => this.connectToRealtimeSync(), 5000);
    };
  }

  sendRealtimeMessage(message) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
    }
  }

  handleRealtimeMessage(message) {
    switch (message.type) {
      case 'highlight_added':
        if (message.userId !== this.user.id) {
          this.highlights.set(message.data.id, message.data);
          this.renderHighlights();
        }
        break;
        
      case 'highlight_removed':
        if (message.userId !== this.user.id) {
          this.highlights.delete(message.data.id);
          this.renderHighlights();
        }
        break;
        
      case 'user_joined':
        console.log('👋 User joined:', message.data.login);
        break;
        
      case 'user_left':
        console.log('👋 User left:', message.data.login);
        break;
    }
  }

  clearSelection() {
    // Clear any UI selection state
  }

  destroy() {
    // Cleanup
    if (this.websocket) {
      this.websocket.close();
    }
    
    if (this.overlayCanvas) {
      this.overlayCanvas.remove();
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    this.observers.forEach(observer => observer.disconnect());
  }
}

// Initialize when the script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new GitHubHighlightInjector();
  });
} else {
  new GitHubHighlightInjector();
}