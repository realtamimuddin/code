import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthManager } from '../utils/auth-manager';
import { User } from '../../../shared/types';
import './styles.css';

interface PopupState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  error: string | null;
}

const Popup: React.FC = () => {
  const [state, setState] = useState<PopupState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    connectionStatus: 'disconnected',
    error: null
  });

  const authManager = new AuthManager();

  useEffect(() => {
    initializePopup();
  }, []);

  const initializePopup = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const user = await authManager.getCurrentUser();
      const isAuthenticated = !!user;
      
      // Get connection status from content script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        try {
          const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getConnectionStatus' });
          setState(prev => ({
            ...prev,
            user,
            isAuthenticated,
            connectionStatus: response?.status || 'disconnected',
            isLoading: false
          }));
        } catch (error) {
          // Content script not injected or not responding
          setState(prev => ({
            ...prev,
            user,
            isAuthenticated,
            connectionStatus: 'disconnected',
            isLoading: false
          }));
        }
      } else {
        setState(prev => ({
          ...prev,
          user,
          isAuthenticated,
          isLoading: false
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      }));
    }
  };

  const handleLogin = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      await authManager.initiateGitHubLogin();
      await initializePopup();
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Login failed',
        isLoading: false
      }));
    }
  };

  const handleLogout = async () => {
    try {
      await authManager.logout();
      setState(prev => ({
        ...prev,
        user: null,
        isAuthenticated: false,
        connectionStatus: 'disconnected'
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Logout failed'
      }));
    }
  };

  const toggleHighlightMode = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleHighlightMode' });
      } catch (error) {
        console.error('Failed to toggle highlight mode:', error);
      }
    }
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  if (state.isLoading) {
    return (
      <div className="popup-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="header-content">
          <div className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h1>Code Review Highlights</h1>
          </div>
          <ConnectionIndicator status={state.connectionStatus} />
        </div>
      </header>

      <main className="popup-content">
        {state.error && (
          <div className="error-message">
            <p>{state.error}</p>
            <button onClick={() => setState(prev => ({ ...prev, error: null }))}>
              Dismiss
            </button>
          </div>
        )}

        {!state.isAuthenticated ? (
          <div className="auth-section">
            <div className="auth-content">
              <h2>Welcome!</h2>
              <p>Sign in with GitHub to start highlighting code in pull requests.</p>
              <button className="btn-primary" onClick={handleLogin}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Sign in with GitHub
              </button>
            </div>
          </div>
        ) : (
          <div className="user-section">
            <div className="user-info">
              <img 
                src={state.user!.avatar} 
                alt={state.user!.username}
                className="user-avatar"
              />
              <div className="user-details">
                <h3>{state.user!.username}</h3>
                <div className="user-color">
                  <div 
                    className="color-indicator"
                    style={{ backgroundColor: state.user!.color }}
                  ></div>
                  <span>Your highlight color</span>
                </div>
              </div>
            </div>

            <div className="controls">
              <button 
                className="btn-secondary"
                onClick={toggleHighlightMode}
                title="Toggle highlight mode (Ctrl+H)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11H1l8-8 8 8"/>
                  <path d="M9 11v10a2 2 0 01-2 2H5a2 2 0 01-2-2V11"/>
                </svg>
                Toggle Highlighting
              </button>

              <button className="btn-secondary" onClick={openOptions}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                </svg>
                Settings
              </button>

              <button className="btn-danger" onClick={handleLogout}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                  <polyline points="16,17 21,12 16,7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="popup-footer">
        <p>Press <kbd>Ctrl+H</kbd> to toggle highlighting</p>
      </footer>
    </div>
  );
};

const ConnectionIndicator: React.FC<{ status: 'connected' | 'connecting' | 'disconnected' }> = ({ status }) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'connected':
        return { color: '#22C55E', text: 'Connected' };
      case 'connecting':
        return { color: '#EAB308', text: 'Connecting...' };
      case 'disconnected':
        return { color: '#EF4444', text: 'Disconnected' };
    }
  };

  const { color, text } = getStatusInfo();

  return (
    <div className="connection-indicator">
      <div 
        className="status-dot"
        style={{ backgroundColor: color }}
      ></div>
      <span className="status-text">{text}</span>
    </div>
  );
};

// Initialize React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}