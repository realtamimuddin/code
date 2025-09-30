// Background script for Code Review Highlights extension

import { AuthManager } from '../utils/auth-manager';

class BackgroundService {
  private authManager: AuthManager;

  constructor() {
    this.authManager = new AuthManager();
    this.initialize();
  }

  private initialize() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener(this.handleInstall.bind(this));
    
    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    
    // Handle tab updates to inject content script on navigation
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    
    // Handle extension icon click
    chrome.action.onClicked.addListener(this.handleActionClick.bind(this));
    
    // Periodic token validation
    this.setupTokenValidation();
  }

  private async handleInstall(details: chrome.runtime.InstalledDetails) {
    if (details.reason === 'install') {
      console.log('Code Review Highlights extension installed');
      
      // Open options page on first install
      chrome.runtime.openOptionsPage();
    } else if (details.reason === 'update') {
      console.log('Code Review Highlights extension updated');
      
      // Clear any cached data that might be incompatible
      await chrome.storage.local.clear();
    }
  }

  private handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    switch (message.action) {
      case 'getConnectionStatus':
        this.getConnectionStatus(sendResponse);
        return true;
        
      case 'toggleHighlightMode':
        this.toggleHighlightMode(sender.tab?.id);
        break;
        
      case 'authenticate':
        this.handleAuthentication(sendResponse);
        return true;
        
      case 'logout':
        this.handleLogout(sendResponse);
        return true;
        
      case 'checkPRPage':
        this.checkIfPRPage(sender.tab?.url || '', sendResponse);
        return true;
        
      default:
        console.warn('Unknown message action:', message.action);
    }
    
    return false;
  }

  private async handleTabUpdate(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ) {
    // Only act on complete page loads
    if (changeInfo.status !== 'complete' || !tab.url) {
      return;
    }

    // Check if this is a GitHub PR page
    if (this.isPRPage(tab.url)) {
      try {
        // Check if user is authenticated
        const isAuthenticated = await this.authManager.isAuthenticated();
        
        if (isAuthenticated) {
          // Update extension icon to show active state
          chrome.action.setIcon({
            tabId: tabId,
            path: {
              16: 'icons/icon16-active.png',
              32: 'icons/icon32-active.png',
              48: 'icons/icon48-active.png',
              128: 'icons/icon128-active.png'
            }
          });
          
          chrome.action.setTitle({
            tabId: tabId,
            title: 'Code Review Highlights - Active'
          });
        }
      } catch (error) {
        console.error('Error handling tab update:', error);
      }
    } else {
      // Reset icon to inactive state
      chrome.action.setIcon({
        tabId: tabId,
        path: {
          16: 'icons/icon16.png',
          32: 'icons/icon32.png',
          48: 'icons/icon48.png',
          128: 'icons/icon128.png'
        }
      });
      
      chrome.action.setTitle({
        tabId: tabId,
        title: 'Code Review Highlights'
      });
    }
  }

  private handleActionClick(tab: chrome.tabs.Tab) {
    // Open popup by default - this is handled automatically by manifest
    // But we can add additional logic here if needed
    console.log('Extension icon clicked');
  }

  private async getConnectionStatus(sendResponse: (response: any) => void) {
    try {
      // This would typically check the socket connection status
      // For now, return a default status
      sendResponse({ status: 'disconnected' });
    } catch (error) {
      sendResponse({ status: 'disconnected', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async toggleHighlightMode(tabId?: number) {
    if (!tabId) return;
    
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'toggleHighlightMode' });
    } catch (error) {
      console.error('Error toggling highlight mode:', error);
    }
  }

  private async handleAuthentication(sendResponse: (response: any) => void) {
    try {
      await this.authManager.initiateGitHubLogin();
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Authentication failed' 
      });
    }
  }

  private async handleLogout(sendResponse: (response: any) => void) {
    try {
      await this.authManager.logout();
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Logout failed' 
      });
    }
  }

  private checkIfPRPage(url: string, sendResponse: (response: any) => void) {
    const isPR = this.isPRPage(url);
    sendResponse({ isPRPage: isPR });
  }

  private isPRPage(url: string): boolean {
    return /github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/.test(url);
  }

  private setupTokenValidation() {
    // Check token validity every hour
    const VALIDATION_INTERVAL = 60 * 60 * 1000; // 1 hour
    
    setInterval(async () => {
      try {
        const user = await this.authManager.getCurrentUser();
        if (!user) {
          // Token is invalid, clear storage
          await chrome.storage.local.clear();
          console.log('Token validation failed, cleared storage');
        }
      } catch (error) {
        console.error('Token validation error:', error);
      }
    }, VALIDATION_INTERVAL);
  }
}

// Initialize background service
new BackgroundService();