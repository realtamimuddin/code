import { User } from '../../../shared/types';

export class AuthManager {
  private serverUrl: string;

  constructor() {
    this.serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:3000';
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const result = await chrome.storage.local.get(['authToken', 'currentUser']);
      
      if (!result.authToken) {
        return null;
      }

      // Verify token is still valid
      const response = await fetch(`${this.serverUrl}/auth/user`, {
        headers: {
          'Authorization': `Bearer ${result.authToken}`
        }
      });

      if (response.ok) {
        const user = await response.json();
        
        // Update stored user data
        await chrome.storage.local.set({ currentUser: user });
        
        return user;
      } else {
        // Token invalid, clear storage
        await this.logout();
        return null;
      }
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  async initiateGitHubLogin(): Promise<void> {
    return new Promise((resolve, reject) => {
      const clientId = process.env.REACT_APP_GITHUB_CLIENT_ID;
      if (!clientId) {
        reject(new Error('GitHub client ID not configured'));
        return;
      }

      const redirectUri = chrome.identity.getRedirectURL();
      const scope = 'user:email repo';
      const state = this.generateRandomString(32);
      
      const authUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;

      chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      }, async (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!responseUrl) {
          reject(new Error('No response from GitHub OAuth'));
          return;
        }

        try {
          const url = new URL(responseUrl);
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');
          
          if (!code) {
            throw new Error('No authorization code received');
          }

          if (returnedState !== state) {
            throw new Error('Invalid state parameter');
          }

          await this.exchangeCodeForToken(code);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private async exchangeCodeForToken(code: string): Promise<void> {
    try {
      const response = await fetch(`${this.serverUrl}/auth/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to authenticate');
      }

      const { token, user } = await response.json();
      
      // Store token and user data
      await chrome.storage.local.set({
        authToken: token,
        currentUser: user
      });

      console.log('Authentication successful');
    } catch (error) {
      console.error('Token exchange error:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await chrome.storage.local.remove(['authToken', 'currentUser']);
      console.log('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(['authToken']);
      return !!result.authToken;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  }

  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}