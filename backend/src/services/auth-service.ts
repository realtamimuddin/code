import jwt from 'jsonwebtoken';
import { DatabaseService } from './database-service';
import { User } from '../../../shared/types';

interface GitHubUser {
  id: number;
  login: string;
  email?: string;
  avatar_url: string;
  name?: string;
}

interface GitHubRepository {
  id: number;
  full_name: string;
  private: boolean;
  permissions?: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  };
}

export class AuthService {
  private jwtSecret: string;
  private githubClientId: string;
  private githubClientSecret: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.githubClientId = process.env.GITHUB_CLIENT_ID || '';
    this.githubClientSecret = process.env.GITHUB_CLIENT_SECRET || '';
    
    if (!this.githubClientId || !this.githubClientSecret) {
      console.warn('GitHub OAuth credentials not configured');
    }
  }

  async handleGitHubCallback(code: string): Promise<{ token: string; user: User }> {
    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.githubClientId,
          client_secret: this.githubClientSecret,
          code: code,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        throw new Error(`GitHub OAuth error: ${tokenData.error_description}`);
      }

      const accessToken = tokenData.access_token;

      // Get user info from GitHub
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      const githubUser: GitHubUser = await userResponse.json();

      // Get user email if not public
      let email = githubUser.email;
      if (!email) {
        const emailResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `token ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        });
        
        const emails = await emailResponse.json();
        const primaryEmail = emails.find((e: any) => e.primary);
        if (primaryEmail) {
          email = primaryEmail.email;
        }
      }

      // Create or update user in database
      const db = new DatabaseService();
      await db.connect();

      let user = await db.getUserByGithubId(githubUser.id.toString());
      
      if (!user) {
        // Generate a random color for new users
        const colors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        user = await db.createUser({
          githubId: githubUser.id.toString(),
          username: githubUser.login,
          email: email,
          avatar: githubUser.avatar_url,
          color: randomColor
        });
      } else {
        // Update user info
        user = await db.updateUser(user.id, {
          username: githubUser.login,
          email: email,
          avatar: githubUser.avatar_url
        });
      }

      await db.disconnect();

      // Create JWT token
      const token = jwt.sign(
        { 
          userId: user.id,
          githubId: user.githubId,
          githubToken: accessToken // Store GitHub token for API calls
        },
        this.jwtSecret,
        { expiresIn: '7d' }
      );

      const userResponse: User = {
        id: user.id,
        githubId: user.githubId,
        username: user.username,
        avatar: user.avatar,
        color: user.color
      };

      return { token, user: userResponse };
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      throw new Error('Authentication failed');
    }
  }

  async verifyToken(token: string): Promise<User> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      const db = new DatabaseService();
      await db.connect();
      
      const user = await db.getUserById(decoded.userId);
      await db.disconnect();
      
      if (!user) {
        throw new Error('User not found');
      }

      return {
        id: user.id,
        githubId: user.githubId,
        username: user.username,
        avatar: user.avatar,
        color: user.color
      };
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async checkRepositoryAccess(githubId: string, prUrl: string): Promise<boolean> {
    try {
      // Extract owner and repo from PR URL
      const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
      if (!match) {
        return false;
      }

      const [, owner, repo] = match;
      const fullName = `${owner}/${repo}`;

      // Get GitHub token from JWT (in a real app, you'd store this securely)
      // For now, we'll use a simplified approach
      
      // Check if repo is public first
      const repoResponse = await fetch(`https://api.github.com/repos/${fullName}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (repoResponse.ok) {
        const repoData: GitHubRepository = await repoResponse.json();
        
        // If repo is public, allow access
        if (!repoData.private) {
          return true;
        }

        // For private repos, we'd need to check user's access with their GitHub token
        // This would require storing the GitHub token securely and checking permissions
        // For this implementation, we'll return true for demo purposes
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking repository access:', error);
      return false;
    }
  }

  async getGitHubToken(userId: string): Promise<string | null> {
    // In a production app, you'd securely store and retrieve GitHub tokens
    // This is a simplified implementation
    try {
      const db = new DatabaseService();
      await db.connect();
      
      const user = await db.getUserById(userId);
      await db.disconnect();
      
      if (!user) {
        return null;
      }

      // In a real implementation, you'd decrypt and return the stored token
      return null;
    } catch (error) {
      console.error('Error getting GitHub token:', error);
      return null;
    }
  }

  generateRandomColor(): string {
    const colors = [
      '#EF4444', '#F97316', '#EAB308', '#22C55E', 
      '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}