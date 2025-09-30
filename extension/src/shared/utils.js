/**
 * Shared utilities for Code Review Highlight extension
 */

// DOM utilities
export const DOM = {
  // Find element with fallback selectors
  findElement(selectors) {
    if (typeof selectors === 'string') {
      return document.querySelector(selectors);
    }
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  },

  // Find all elements with fallback selectors
  findElements(selectors) {
    if (typeof selectors === 'string') {
      return Array.from(document.querySelectorAll(selectors));
    }
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) return Array.from(elements);
    }
    return [];
  },

  // Check if element matches any selector
  matches(element, selectors) {
    if (!element || !element.matches) return false;
    
    if (typeof selectors === 'string') {
      return element.matches(selectors);
    }
    
    return selectors.some(selector => element.matches(selector));
  },

  // Get element bounds relative to container
  getRelativeBounds(element, container) {
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    return {
      top: elementRect.top - containerRect.top,
      left: elementRect.left - containerRect.left,
      width: elementRect.width,
      height: elementRect.height,
      right: elementRect.right - containerRect.left,
      bottom: elementRect.bottom - containerRect.top
    };
  },

  // Create element with attributes
  createElement(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else {
        element.setAttribute(key, value);
      }
    });
    
    children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    });
    
    return element;
  }
};

// Color utilities
export const ColorUtils = {
  // Convert hex to rgba
  hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  // Get contrasting text color
  getContrastColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  },

  // Lighten/darken color
  adjustBrightness(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  },

  // Default color palette
  PALETTE: [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
    '#FFEAA7', '#DDA0DD', '#98D8C8'
  ]
};

// URL utilities
export const URLUtils = {
  // Parse GitHub PR URL
  parsePRUrl(url) {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
    if (!match) return null;
    
    return {
      owner: match[1],
      repo: match[2],
      number: parseInt(match[3]),
      url: url.split('#')[0] // Remove fragment
    };
  },

  // Check if URL is a GitHub PR
  isGitHubPR(url) {
    return url.includes('github.com') && url.includes('/pull/');
  },

  // Generate room ID from PR info
  generateRoomId(prInfo) {
    return `pr-${prInfo.owner}-${prInfo.repo}-${prInfo.number}`;
  }
};

// Debounce utility
export function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
}

// Throttle utility
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Event emitter
export class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  }

  emit(event, ...args) {
    if (!this.events[event]) return;
    this.events[event].forEach(callback => {
      try {
        callback(...args);
      } catch (error) {
        console.error('Error in event callback:', error);
      }
    });
  }

  once(event, callback) {
    const wrapper = (...args) => {
      callback(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}

// Storage utilities
export const Storage = {
  // Get from chrome storage
  async get(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  },

  // Set to chrome storage
  async set(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, resolve);
    });
  },

  // Remove from chrome storage
  async remove(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, resolve);
    });
  },

  // Clear chrome storage
  async clear() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(resolve);
    });
  }
};

// Message utilities
export const Messaging = {
  // Send message to background script
  async sendToBackground(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  },

  // Send message to content script
  async sendToContent(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, resolve);
    });
  },

  // Send message to all tabs
  async sendToAllTabs(message) {
    const tabs = await chrome.tabs.query({});
    const promises = tabs.map(tab => 
      this.sendToContent(tab.id, message).catch(() => null)
    );
    return Promise.all(promises);
  }
};

// Performance utilities
export const Performance = {
  // Measure execution time
  time(label) {
    console.time(label);
  },

  timeEnd(label) {
    console.timeEnd(label);
  },

  // RAF-based animation frame
  nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
  },

  // Wait for idle callback
  idle() {
    return new Promise(resolve => {
      if (window.requestIdleCallback) {
        requestIdleCallback(resolve);
      } else {
        setTimeout(resolve, 0);
      }
    });
  }
};

// Validation utilities
export const Validation = {
  // Validate highlight data
  isValidHighlight(highlight) {
    return highlight &&
           typeof highlight.id === 'string' &&
           typeof highlight.filePath === 'string' &&
           typeof highlight.lineNumber === 'number' &&
           typeof highlight.userId === 'string' &&
           typeof highlight.color === 'string' &&
           typeof highlight.timestamp === 'number';
  },

  // Validate user data
  isValidUser(user) {
    return user &&
           typeof user.id === 'string' &&
           typeof user.login === 'string' &&
           typeof user.avatar_url === 'string';
  },

  // Validate PR data
  isValidPR(pr) {
    return pr &&
           typeof pr.owner === 'string' &&
           typeof pr.repo === 'string' &&
           typeof pr.number === 'number' &&
           typeof pr.url === 'string';
  }
};

// Error handling
export class ExtensionError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ExtensionError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

// Logger utility
export const Logger = {
  debug: (...args) => {
    if (localStorage.getItem('crh-debug') === 'true') {
      console.log('🎨 CRH:', ...args);
    }
  },

  info: (...args) => console.info('🎨 CRH:', ...args),
  warn: (...args) => console.warn('🎨 CRH:', ...args),
  error: (...args) => console.error('🎨 CRH:', ...args),

  time: (label) => {
    if (localStorage.getItem('crh-debug') === 'true') {
      console.time(`🎨 CRH: ${label}`);
    }
  },

  timeEnd: (label) => {
    if (localStorage.getItem('crh-debug') === 'true') {
      console.timeEnd(`🎨 CRH: ${label}`);
    }
  }
};