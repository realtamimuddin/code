/**
 * Supabase Client for Code Review Highlights
 * Handles persistence, real-time subscriptions, and user management
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey?: string;
}

interface HighlightData {
  id: string;
  external_id: string;
  pull_request_id: string;
  user_id: string;
  file_path: string;
  line_number: number;
  color: string;
  comment_text?: string;
  created_at?: string;
  updated_at?: string;
}

interface UserData {
  id: string;
  github_id: number;
  login: string;
  name: string;
  avatar_url: string;
  email?: string;
}

interface PRData {
  id: string;
  repository_id: string;
  number: number;
  title: string;
  state: string;
  github_id: number;
  author_github_id: number;
  head_sha: string;
  base_sha: string;
  url: string;
}

export class SupabaseHighlightClient {
  private client: SupabaseClient;
  private serviceClient: SupabaseClient;
  private subscriptions: Map<string, RealtimeChannel> = new Map();

  constructor(config: SupabaseConfig) {
    // Public client for authenticated operations
    this.client = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });

    // Service client for admin operations (if available)
    if (config.serviceKey) {
      this.serviceClient = createClient(config.url, config.serviceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
    } else {
      this.serviceClient = this.client;
    }
  }

  // Authentication methods
  async authenticateWithGitHub(accessToken: string): Promise<any> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: 'chrome-extension://your-extension-id/callback.html'
      }
    });

    if (error) throw error;
    return data;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  // User management
  async getOrCreateUser(githubUser: {
    id: number;
    login: string;
    name: string;
    avatar_url: string;
    email?: string;
  }): Promise<UserData> {
    const { data, error } = await this.serviceClient.rpc('get_or_create_user', {
      p_github_id: githubUser.id,
      p_login: githubUser.login,
      p_name: githubUser.name,
      p_avatar_url: githubUser.avatar_url,
      p_email: githubUser.email
    });

    if (error) throw error;

    // Get the user data
    const { data: userData, error: userError } = await this.client
      .from('users')
      .select('*')
      .eq('id', data)
      .single();

    if (userError) throw userError;
    return userData;
  }

  // Repository and PR management
  async getOrCreateRepository(repoData: {
    owner: string;
    name: string;
    github_id: number;
    private?: boolean;
  }): Promise<string> {
    const { data, error } = await this.serviceClient.rpc('get_or_create_repository', {
      p_owner: repoData.owner,
      p_name: repoData.name,
      p_github_id: repoData.github_id,
      p_private: repoData.private || false
    });

    if (error) throw error;
    return data;
  }

  async getOrCreatePullRequest(prData: {
    repository_id: string;
    number: number;
    title: string;
    github_id: number;
    author_github_id: number;
    head_sha: string;
    base_sha: string;
    url: string;
  }): Promise<string> {
    // Check if PR exists
    const { data: existingPR, error: selectError } = await this.client
      .from('pull_requests')
      .select('id')
      .eq('repository_id', prData.repository_id)
      .eq('number', prData.number)
      .single();

    if (selectError && selectError.code !== 'PGRST116') { // Not found error
      throw selectError;
    }

    if (existingPR) {
      return existingPR.id;
    }

    // Create new PR
    const { data, error } = await this.client
      .from('pull_requests')
      .insert({
        repository_id: prData.repository_id,
        number: prData.number,
        title: prData.title,
        github_id: prData.github_id,
        author_github_id: prData.author_github_id,
        head_sha: prData.head_sha,
        base_sha: prData.base_sha,
        url: prData.url
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  // Highlight management
  async saveHighlight(highlight: HighlightData): Promise<HighlightData> {
    const { data, error } = await this.client
      .from('highlights')
      .upsert({
        external_id: highlight.external_id,
        pull_request_id: highlight.pull_request_id,
        user_id: highlight.user_id,
        file_path: highlight.file_path,
        line_number: highlight.line_number,
        color: highlight.color,
        comment_text: highlight.comment_text
      }, {
        onConflict: 'external_id'
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async removeHighlight(highlightId: string): Promise<void> {
    const { error } = await this.client
      .from('highlights')
      .delete()
      .eq('external_id', highlightId);

    if (error) throw error;
  }

  async getHighlightsForPR(prId: string): Promise<HighlightData[]> {
    const { data, error } = await this.client
      .from('highlights_with_details')
      .select('*')
      .eq('pull_request_id', prId);

    if (error) throw error;
    return data || [];
  }

  async clearUserHighlights(prId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from('highlights')
      .delete()
      .eq('pull_request_id', prId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  // Real-time subscriptions
  async subscribeToHighlights(
    prId: string, 
    onUpdate: (payload: any) => void
  ): Promise<string> {
    const channelName = `highlights:${prId}`;
    
    // Remove existing subscription if any
    this.unsubscribeFromHighlights(channelName);

    const channel = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'highlights',
          filter: `pull_request_id=eq.${prId}`
        },
        (payload) => {
          console.log('Highlight update:', payload);
          onUpdate(payload);
        }
      )
      .subscribe();

    this.subscriptions.set(channelName, channel);
    return channelName;
  }

  async subscribeToActiveUsers(
    prId: string,
    onUpdate: (payload: any) => void
  ): Promise<string> {
    const channelName = `active_users:${prId}`;
    
    // Remove existing subscription if any
    this.unsubscribeFromActiveUsers(channelName);

    const channel = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_sessions',
          filter: `pull_request_id=eq.${prId}`
        },
        (payload) => {
          console.log('Active users update:', payload);
          onUpdate(payload);
        }
      )
      .subscribe();

    this.subscriptions.set(channelName, channel);
    return channelName;
  }

  unsubscribeFromHighlights(channelName: string): void {
    const channel = this.subscriptions.get(channelName);
    if (channel) {
      this.client.removeChannel(channel);
      this.subscriptions.delete(channelName);
    }
  }

  unsubscribeFromActiveUsers(channelName: string): void {
    const channel = this.subscriptions.get(channelName);
    if (channel) {
      this.client.removeChannel(channel);
      this.subscriptions.delete(channelName);
    }
  }

  // Session management
  async joinSession(prId: string, userId: string, connectionId: string): Promise<void> {
    const { error } = await this.client
      .from('active_sessions')
      .upsert({
        user_id: userId,
        pull_request_id: prId,
        room_id: `pr-${prId}`,
        connection_id: connectionId,
        last_seen: new Date().toISOString()
      }, {
        onConflict: 'user_id,pull_request_id'
      });

    if (error) throw error;
  }

  async leaveSession(prId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from('active_sessions')
      .delete()
      .eq('pull_request_id', prId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async updateSessionHeartbeat(prId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from('active_sessions')
      .update({ last_seen: new Date().toISOString() })
      .eq('pull_request_id', prId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async getActiveUsers(prId: string): Promise<UserData[]> {
    const { data, error } = await this.client
      .from('active_users_per_pr')
      .select('*')
      .eq('pull_request_id', prId);

    if (error) throw error;
    return data || [];
  }

  // Permission management
  async grantRepositoryAccess(userId: string, repositoryId: string, accessLevel: string = 'read'): Promise<void> {
    const { error } = await this.serviceClient.rpc('grant_repository_access', {
      p_user_id: userId,
      p_repository_id: repositoryId,
      p_access_level: accessLevel
    });

    if (error) throw error;
  }

  async checkRepositoryAccess(userId: string, repositoryId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('user_repository_access')
      .select('access_level')
      .eq('user_id', userId)
      .eq('repository_id', repositoryId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  // Cleanup methods
  async cleanupOldSessions(): Promise<void> {
    const { error } = await this.serviceClient.rpc('cleanup_old_sessions');
    if (error) throw error;
  }

  // Disconnect all subscriptions
  disconnect(): void {
    for (const [channelName, channel] of this.subscriptions) {
      this.client.removeChannel(channel);
    }
    this.subscriptions.clear();
  }
}