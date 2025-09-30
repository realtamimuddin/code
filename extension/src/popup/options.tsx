import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthManager } from '../utils/auth-manager';
import { User } from '../../../shared/types';
import './styles.css';

interface OptionsState {
  user: User | null;
  isAuthenticated: boolean;
  settings: {
    highlightColor: string;
    showTooltips: boolean;
    enableNotifications: boolean;
    autoHighlight: boolean;
  };
  isLoading: boolean;
  isSaving: boolean;
  message: string | null;
}

const Options: React.FC = () => {
  const [state, setState] = useState<OptionsState>({
    user: null,
    isAuthenticated: false,
    settings: {
      highlightColor: '#3B82F6',
      showTooltips: true,
      enableNotifications: true,
      autoHighlight: false
    },
    isLoading: true,
    isSaving: false,
    message: null
  });

  const authManager = new AuthManager();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      const user = await authManager.getCurrentUser();
      const isAuthenticated = !!user;
      
      // Load settings from storage
      const result = await chrome.storage.sync.get(['highlightSettings']);
      const settings = result.highlightSettings || state.settings;
      
      setState(prev => ({
        ...prev,
        user,
        isAuthenticated,
        settings,
        isLoading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        message: 'Failed to load settings',
        isLoading: false
      }));
    }
  };

  const saveSettings = async () => {
    try {
      setState(prev => ({ ...prev, isSaving: true, message: null }));
      
      await chrome.storage.sync.set({
        highlightSettings: state.settings
      });
      
      setState(prev => ({
        ...prev,
        isSaving: false,
        message: 'Settings saved successfully!'
      }));
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setState(prev => ({ ...prev, message: null }));
      }, 3000);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isSaving: false,
        message: 'Failed to save settings'
      }));
    }
  };

  const handleSettingChange = (key: keyof typeof state.settings, value: any) => {
    setState(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [key]: value
      }
    }));
  };

  const handleLogin = async () => {
    try {
      await authManager.initiateGitHubLogin();
      await loadSettings();
    } catch (error) {
      setState(prev => ({
        ...prev,
        message: 'Login failed. Please try again.'
      }));
    }
  };

  const handleLogout = async () => {
    try {
      await authManager.logout();
      setState(prev => ({
        ...prev,
        user: null,
        isAuthenticated: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        message: 'Logout failed'
      }));
    }
  };

  const colorOptions = [
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Green', value: '#22C55E' },
    { name: 'Yellow', value: '#EAB308' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Teal', value: '#06B6D4' }
  ];

  if (state.isLoading) {
    return (
      <div className="options-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="options-container">
      <header className="options-header">
        <h1>Code Review Highlights - Settings</h1>
        <p>Configure your highlighting preferences and account settings</p>
      </header>

      <main className="options-content">
        {state.message && (
          <div className={`message ${state.message.includes('success') ? 'success' : 'error'}`}>
            {state.message}
          </div>
        )}

        <section className="options-section">
          <h2>Account</h2>
          
          {!state.isAuthenticated ? (
            <div className="auth-section">
              <p>Sign in to sync your settings across devices and collaborate with your team.</p>
              <button className="btn-primary" onClick={handleLogin}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Sign in with GitHub
              </button>
            </div>
          ) : (
            <div className="user-info">
              <div className="user-details">
                <img 
                  src={state.user!.avatar} 
                  alt={state.user!.username}
                  className="user-avatar"
                />
                <div>
                  <h3>{state.user!.username}</h3>
                  <p>Signed in with GitHub</p>
                </div>
              </div>
              <button className="btn-secondary" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          )}
        </section>

        <section className="options-section">
          <h2>Appearance</h2>
          
          <div className="setting-group">
            <label htmlFor="highlightColor">Highlight Color</label>
            <div className="color-picker">
              {colorOptions.map(color => (
                <button
                  key={color.value}
                  className={`color-option ${state.settings.highlightColor === color.value ? 'selected' : ''}`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                  onClick={() => handleSettingChange('highlightColor', color.value)}
                />
              ))}
            </div>
            <p className="setting-description">
              Choose the color for your highlights. Other users will see your highlights in this color.
            </p>
          </div>
        </section>

        <section className="options-section">
          <h2>Behavior</h2>
          
          <div className="setting-group">
            <div className="setting-row">
              <div>
                <label htmlFor="showTooltips">Show Tooltips</label>
                <p className="setting-description">
                  Display usernames and comments when hovering over highlights
                </p>
              </div>
              <input
                type="checkbox"
                id="showTooltips"
                checked={state.settings.showTooltips}
                onChange={(e) => handleSettingChange('showTooltips', e.target.checked)}
              />
            </div>
          </div>

          <div className="setting-group">
            <div className="setting-row">
              <div>
                <label htmlFor="enableNotifications">Enable Notifications</label>
                <p className="setting-description">
                  Show notifications when other users join or create highlights
                </p>
              </div>
              <input
                type="checkbox"
                id="enableNotifications"
                checked={state.settings.enableNotifications}
                onChange={(e) => handleSettingChange('enableNotifications', e.target.checked)}
              />
            </div>
          </div>

          <div className="setting-group">
            <div className="setting-row">
              <div>
                <label htmlFor="autoHighlight">Auto-highlight Selection</label>
                <p className="setting-description">
                  Automatically create highlights when you select text (experimental)
                </p>
              </div>
              <input
                type="checkbox"
                id="autoHighlight"
                checked={state.settings.autoHighlight}
                onChange={(e) => handleSettingChange('autoHighlight', e.target.checked)}
              />
            </div>
          </div>
        </section>

        <section className="options-section">
          <h2>Keyboard Shortcuts</h2>
          <div className="shortcuts">
            <div className="shortcut">
              <kbd>Ctrl</kbd> + <kbd>H</kbd>
              <span>Toggle highlight mode</span>
            </div>
            <div className="shortcut">
              <kbd>Esc</kbd>
              <span>Exit highlight mode</span>
            </div>
            <div className="shortcut">
              <kbd>Delete</kbd>
              <span>Remove selected highlight</span>
            </div>
          </div>
        </section>

        <div className="save-section">
          <button 
            className="btn-primary save-button"
            onClick={saveSettings}
            disabled={state.isSaving}
          >
            {state.isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </main>
    </div>
  );
};

// Initialize React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Options />);
}