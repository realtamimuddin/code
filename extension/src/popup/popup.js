/**
 * Code Review Highlight - Popup Interface
 */

class PopupController {
  constructor() {
    this.user = null;
    this.prInfo = null;
    this.activeUsers = new Map();
    this.highlights = new Map();
    this.selectedColor = '#FF6B6B';
    this.connectionStatus = 'connecting';
    
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.checkAuthentication();
    this.updateUI();
  }

  setupEventListeners() {
    // Authentication
    document.getElementById('auth-button').addEventListener('click', () => {
      this.authenticate();
    });

    document.getElementById('logout-button').addEventListener('click', () => {
      this.logout();
    });

    // Color selection
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.selectColor(e.target.dataset.color);
      });
    });

    // Actions
    document.getElementById('clear-highlights').addEventListener('click', () => {
      this.clearMyHighlights();
    });

    document.getElementById('export-highlights').addEventListener('click', () => {
      this.exportHighlights();
    });

    document.getElementById('retry-button').addEventListener('click', () => {
      this.init();
    });

    // Listen to messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });
  }

  async checkAuthentication() {
    try {
      const response = await this.sendMessage({ type: 'GET_USER' });
      this.user = response.user;
      
      if (this.user) {
        await this.checkPRContext();
      }
    } catch (error) {
      console.error('Failed to check authentication:', error);
      this.showError('Failed to check authentication');
    }
  }

  async checkPRContext() {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('github.com') && tab.url.includes('/pull/')) {
        const response = await this.sendMessage({ 
          type: 'GET_PR_INFO', 
          prUrl: tab.url 
        });
        this.prInfo = response.prInfo;
      }
    } catch (error) {
      console.error('Failed to get PR context:', error);
    }
  }

  async authenticate() {
    try {
      this.showLoading();
      
      const response = await this.sendMessage({ type: 'AUTHENTICATE' });
      
      if (response.success) {
        this.user = response.user;
        await this.checkPRContext();
        this.updateUI();
      } else {
        this.showError(response.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      this.showError('Authentication failed');
    }
  }

  async logout() {
    try {
      await this.sendMessage({ type: 'LOGOUT' });
      this.user = null;
      this.prInfo = null;
      this.updateUI();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  selectColor(color) {
    this.selectedColor = color;
    
    // Update UI
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    document.querySelector(`[data-color="${color}"]`).classList.add('active');
    
    // Send color to content script
    this.sendToActiveTab({ 
      type: 'SET_HIGHLIGHT_COLOR', 
      color: color 
    });
  }

  async clearMyHighlights() {
    if (!confirm('Clear all your highlights from this PR?')) return;
    
    try {
      this.sendToActiveTab({ 
        type: 'CLEAR_USER_HIGHLIGHTS', 
        userId: this.user.id 
      });
    } catch (error) {
      console.error('Failed to clear highlights:', error);
    }
  }

  exportHighlights() {
    const data = {
      pr: this.prInfo,
      highlights: Array.from(this.highlights.values()),
      exportedAt: new Date().toISOString(),
      exportedBy: this.user
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `highlights-${this.prInfo?.owner}-${this.prInfo?.repo}-${this.prInfo?.number}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'USERS_UPDATED':
        this.activeUsers = new Map(message.users.map(u => [u.id, u]));
        this.updateActiveUsers();
        break;
        
      case 'HIGHLIGHTS_UPDATED':
        this.highlights = new Map(message.highlights.map(h => [h.id, h]));
        this.updateStats();
        break;
        
      case 'CONNECTION_STATUS':
        this.connectionStatus = message.status;
        this.updateConnectionStatus();
        break;
    }
  }

  updateUI() {
    if (!this.user) {
      this.showSection('auth-section');
    } else {
      this.showSection('main-section');
      this.updateUserInfo();
      this.updatePRInfo();
    }
  }

  updateUserInfo() {
    if (!this.user) return;
    
    document.getElementById('user-avatar').src = this.user.avatar_url;
    document.getElementById('user-name').textContent = this.user.name;
    document.getElementById('user-login').textContent = `@${this.user.login}`;
  }

  updatePRInfo() {
    const prInfoEl = document.getElementById('pr-info');
    
    if (this.prInfo) {
      prInfoEl.classList.remove('hidden');
      document.getElementById('pr-title-text').textContent = this.prInfo.title || 'Pull Request';
      document.getElementById('pr-repo').textContent = `${this.prInfo.owner}/${this.prInfo.repo}`;
      document.getElementById('pr-number').textContent = `#${this.prInfo.number}`;
    } else {
      prInfoEl.classList.add('hidden');
    }
  }

  updateActiveUsers() {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    
    for (const user of this.activeUsers.values()) {
      const userEl = document.createElement('div');
      userEl.className = 'user-item';
      userEl.innerHTML = `
        <img src="${user.avatar_url}" alt="${user.name}" class="user-item-avatar">
        <span>${user.name}</span>
      `;
      usersList.appendChild(userEl);
    }
    
    this.updateStats();
  }

  updateStats() {
    document.getElementById('highlight-count').textContent = this.highlights.size;
    document.getElementById('user-count').textContent = this.activeUsers.size;
  }

  updateConnectionStatus() {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    
    indicator.className = `status-indicator ${this.connectionStatus}`;
    
    switch (this.connectionStatus) {
      case 'connected':
        text.textContent = 'Connected';
        break;
      case 'connecting':
        text.textContent = 'Connecting...';
        break;
      case 'disconnected':
        text.textContent = 'Disconnected';
        break;
      default:
        text.textContent = 'Unknown';
    }
  }

  showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
      section.classList.add('hidden');
    });
    
    document.getElementById(sectionId).classList.remove('hidden');
  }

  showLoading() {
    this.showSection('loading-section');
  }

  showError(message) {
    document.getElementById('error-message').textContent = message;
    this.showSection('error-section');
  }

  async sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response || {});
      });
    });
  }

  async sendToActiveTab(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, message);
    }
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});