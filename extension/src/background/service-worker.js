/**
 * Background Service Worker - GitHub OAuth and Authentication
 */

class BackgroundService {
  constructor() {
    this.user = null;
    this.accessToken = null;
    this.setupMessageHandlers();
    this.checkExistingAuth();
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener(() => {
      console.log('Code Review Highlight extension installed');
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.type) {
        case 'GET_USER':
          sendResponse({ user: this.user });
          break;

        case 'AUTHENTICATE':
          const authResult = await this.authenticateWithGitHub();
          sendResponse(authResult);
          break;

        case 'LOGOUT':
          await this.logout();
          sendResponse({ success: true });
          break;

        case 'CHECK_REPO_ACCESS':
          const hasAccess = await this.checkRepositoryAccess(request.repo);
          sendResponse({ hasAccess });
          break;

        case 'GET_PR_INFO':
          const prInfo = await this.getPullRequestInfo(request.prUrl);
          sendResponse({ prInfo });
          break;

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background service error:', error);
      sendResponse({ error: error.message });
    }
  }

  async checkExistingAuth() {
    try {
      const result = await chrome.storage.local.get(['accessToken', 'user']);
      if (result.accessToken && result.user) {
        this.accessToken = result.accessToken;
        this.user = result.user;
        
        // Verify token is still valid
        const isValid = await this.verifyToken();
        if (!isValid) {
          await this.clearAuth();
        }
      }
    } catch (error) {
      console.error('Failed to check existing auth:', error);
    }
  }

  async authenticateWithGitHub() {
    try {
      // Use Chrome Identity API for OAuth
      const redirectUrl = chrome.identity.getRedirectURL();
      const clientId = 'YOUR_GITHUB_OAUTH_CLIENT_ID'; // Replace with actual client ID
      
      const authUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUrl)}&` +
        `scope=user:email repo&` +
        `state=${Math.random().toString(36).substring(7)}`;

      // Launch OAuth flow
      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });

      // Extract authorization code
      const url = new URL(responseUrl);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for access token
      const tokenResponse = await this.exchangeCodeForToken(code);
      this.accessToken = tokenResponse.access_token;

      // Get user information
      this.user = await this.fetchUserInfo();

      // Store authentication data
      await chrome.storage.local.set({
        accessToken: this.accessToken,
        user: this.user
      });

      return { success: true, user: this.user };

    } catch (error) {
      console.error('GitHub authentication failed:', error);
      return { success: false, error: error.message };
    }
  }

  async exchangeCodeForToken(code) {
    const clientId = 'YOUR_GITHUB_OAUTH_CLIENT_ID';
    const clientSecret = 'YOUR_GITHUB_OAUTH_CLIENT_SECRET'; // In production, this should be handled by your backend
    
    // Note: In a production environment, this token exchange should happen on your backend
    // to keep the client secret secure. For this example, we're showing the flow.
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return await response.json();
  }

  async fetchUserInfo() {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${this.accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }

    const userData = await response.json();
    
    return {
      id: userData.id.toString(),
      login: userData.login,
      name: userData.name || userData.login,
      avatar_url: userData.avatar_url,
      email: userData.email
    };
  }

  async verifyToken() {
    if (!this.accessToken) return false;

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${this.accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async checkRepositoryAccess(repo) {
    if (!this.accessToken) return false;

    try {
      const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`, {
        headers: {
          'Authorization': `token ${this.accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Repository access check failed:', error);
      return false;
    }
  }

  async getPullRequestInfo(prUrl) {
    if (!this.accessToken) return null;

    try {
      const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
      if (!match) return null;

      const [, owner, repo, number] = match;
      
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
        headers: {
          'Authorization': `token ${this.accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) return null;

      const prData = await response.json();
      
      return {
        id: prData.id,
        number: prData.number,
        title: prData.title,
        state: prData.state,
        owner,
        repo,
        author: prData.user.login,
        created_at: prData.created_at,
        updated_at: prData.updated_at,
        mergeable: prData.mergeable,
        head: prData.head.sha,
        base: prData.base.sha
      };
    } catch (error) {
      console.error('Failed to fetch PR info:', error);
      return null;
    }
  }

  async logout() {
    await this.clearAuth();
  }

  async clearAuth() {
    this.user = null;
    this.accessToken = null;
    await chrome.storage.local.remove(['accessToken', 'user']);
  }
}

// Initialize background service
new BackgroundService();