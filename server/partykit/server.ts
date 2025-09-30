/**
 * PartyKit Real-time Server for Code Review Highlights
 * Handles WebSocket connections, conflict resolution, and state synchronization
 */

import type { Party, PartyServer, Connection } from "partykit";

interface HighlightData {
  id: string;
  prUrl: string;
  filePath: string;
  lineNumber: number;
  userId: string;
  userName: string;
  userAvatar: string;
  color: string;
  timestamp: number;
  text?: string;
}

interface User {
  id: string;
  login: string;
  name: string;
  avatar_url: string;
  connection: Connection;
  lastSeen: number;
}

interface RealtimeMessage {
  type: 'highlight_added' | 'highlight_removed' | 'user_joined' | 'user_left' | 'cursor_moved' | 'sync_state';
  data: any;
  userId: string;
  timestamp: number;
}

interface RoomState {
  highlights: Map<string, HighlightData>;
  users: Map<string, User>;
  lastActivity: number;
  prInfo: {
    owner: string;
    repo: string;
    number: number;
    url: string;
  } | null;
}

export default class CodeReviewHighlightServer implements PartyServer {
  private state: RoomState;
  private conflictResolutionQueue: RealtimeMessage[] = [];
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly USER_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  constructor(public party: Party) {
    this.state = {
      highlights: new Map(),
      users: new Map(),
      lastActivity: Date.now(),
      prInfo: null
    };

    // Setup periodic cleanup
    setInterval(() => this.cleanupInactiveUsers(), this.CLEANUP_INTERVAL);
  }

  async onConnect(connection: Connection) {
    console.log(`🔗 Connection ${connection.id} connected to room ${this.party.id}`);
    
    // Extract PR info from room ID (format: pr-owner-repo-number)
    if (!this.state.prInfo) {
      this.state.prInfo = this.parsePRFromRoomId(this.party.id);
    }

    // Send current state to new connection
    this.sendToConnection(connection, {
      type: 'sync_state',
      data: {
        highlights: Array.from(this.state.highlights.values()),
        users: Array.from(this.state.users.values()).map(u => ({
          id: u.id,
          login: u.login,
          name: u.name,
          avatar_url: u.avatar_url
        }))
      },
      userId: 'system',
      timestamp: Date.now()
    });
  }

  async onMessage(message: string, sender: Connection) {
    try {
      const parsedMessage: RealtimeMessage = JSON.parse(message);
      await this.handleMessage(parsedMessage, sender);
    } catch (error) {
      console.error('Failed to parse message:', error);
      this.sendError(sender, 'Invalid message format');
    }
  }

  async onClose(connection: Connection) {
    console.log(`🔌 Connection ${connection.id} disconnected from room ${this.party.id}`);
    
    // Find and remove user
    for (const [userId, user] of this.state.users) {
      if (user.connection.id === connection.id) {
        this.state.users.delete(userId);
        
        // Notify other users
        this.broadcastToOthers({
          type: 'user_left',
          data: {
            id: user.id,
            login: user.login,
            name: user.name,
            avatar_url: user.avatar_url
          },
          userId: user.id,
          timestamp: Date.now()
        }, connection);
        
        break;
      }
    }
  }

  private async handleMessage(message: RealtimeMessage, sender: Connection) {
    this.state.lastActivity = Date.now();

    switch (message.type) {
      case 'user_joined':
        await this.handleUserJoined(message, sender);
        break;

      case 'highlight_added':
        await this.handleHighlightAdded(message, sender);
        break;

      case 'highlight_removed':
        await this.handleHighlightRemoved(message, sender);
        break;

      case 'cursor_moved':
        await this.handleCursorMoved(message, sender);
        break;

      default:
        this.sendError(sender, `Unknown message type: ${message.type}`);
    }
  }

  private async handleUserJoined(message: RealtimeMessage, sender: Connection) {
    const userData = message.data;
    
    // Validate user data
    if (!userData.id || !userData.login) {
      this.sendError(sender, 'Invalid user data');
      return;
    }

    // Check for repository access (simplified - in production, verify with GitHub API)
    const hasAccess = await this.verifyRepositoryAccess(userData, this.state.prInfo);
    if (!hasAccess) {
      this.sendError(sender, 'Insufficient repository access');
      return;
    }

    // Add user to room
    const user: User = {
      id: userData.id,
      login: userData.login,
      name: userData.name || userData.login,
      avatar_url: userData.avatar_url,
      connection: sender,
      lastSeen: Date.now()
    };

    this.state.users.set(userData.id, user);

    // Broadcast to other users
    this.broadcastToOthers({
      type: 'user_joined',
      data: {
        id: user.id,
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url
      },
      userId: userData.id,
      timestamp: Date.now()
    }, sender);

    console.log(`👋 User ${userData.login} joined room ${this.party.id}`);
  }

  private async handleHighlightAdded(message: RealtimeMessage, sender: Connection) {
    const highlight: HighlightData = message.data;
    
    // Validate highlight data
    if (!this.validateHighlight(highlight)) {
      this.sendError(sender, 'Invalid highlight data');
      return;
    }

    // Check for conflicts
    const existingHighlight = this.state.highlights.get(highlight.id);
    if (existingHighlight) {
      // Resolve conflict using Last-Write-Wins with timestamp
      if (highlight.timestamp <= existingHighlight.timestamp) {
        // Reject this highlight as it's older
        this.sendToConnection(sender, {
          type: 'highlight_removed',
          data: { id: highlight.id },
          userId: 'system',
          timestamp: Date.now()
        });
        return;
      }
    }

    // Add highlight
    this.state.highlights.set(highlight.id, highlight);

    // Broadcast to all users
    this.broadcastToAll(message);

    // Persist to external storage (if configured)
    await this.persistHighlight(highlight);

    console.log(`✨ Highlight added: ${highlight.id} by ${highlight.userName}`);
  }

  private async handleHighlightRemoved(message: RealtimeMessage, sender: Connection) {
    const { id } = message.data;
    
    if (!id) {
      this.sendError(sender, 'Missing highlight ID');
      return;
    }

    const existingHighlight = this.state.highlights.get(id);
    if (!existingHighlight) {
      return; // Already removed
    }

    // Check if user has permission to remove this highlight
    if (existingHighlight.userId !== message.userId) {
      this.sendError(sender, 'Permission denied');
      return;
    }

    // Remove highlight
    this.state.highlights.delete(id);

    // Broadcast to all users
    this.broadcastToAll(message);

    // Remove from external storage
    await this.removePersistedHighlight(id);

    console.log(`🗑️ Highlight removed: ${id} by ${message.userId}`);
  }

  private async handleCursorMoved(message: RealtimeMessage, sender: Connection) {
    // Broadcast cursor position to other users (not including sender)
    this.broadcastToOthers(message, sender);
  }

  private validateHighlight(highlight: HighlightData): boolean {
    return !!(
      highlight.id &&
      highlight.prUrl &&
      highlight.filePath &&
      typeof highlight.lineNumber === 'number' &&
      highlight.userId &&
      highlight.userName &&
      highlight.color &&
      typeof highlight.timestamp === 'number'
    );
  }

  private async verifyRepositoryAccess(user: any, prInfo: any): Promise<boolean> {
    // In production, this would make an API call to GitHub to verify access
    // For now, we'll assume access is granted
    return true;
  }

  private parsePRFromRoomId(roomId: string) {
    const match = roomId.match(/^pr-([^-]+)-([^-]+)-(\d+)$/);
    if (!match) return null;

    return {
      owner: match[1],
      repo: match[2],
      number: parseInt(match[3]),
      url: `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`
    };
  }

  private sendToConnection(connection: Connection, message: RealtimeMessage) {
    try {
      connection.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message to connection:', error);
    }
  }

  private sendError(connection: Connection, error: string) {
    this.sendToConnection(connection, {
      type: 'error' as any,
      data: { message: error },
      userId: 'system',
      timestamp: Date.now()
    });
  }

  private broadcastToAll(message: RealtimeMessage) {
    const messageStr = JSON.stringify(message);
    for (const user of this.state.users.values()) {
      try {
        user.connection.send(messageStr);
      } catch (error) {
        console.error(`Failed to send to user ${user.login}:`, error);
      }
    }
  }

  private broadcastToOthers(message: RealtimeMessage, excludeConnection: Connection) {
    const messageStr = JSON.stringify(message);
    for (const user of this.state.users.values()) {
      if (user.connection.id !== excludeConnection.id) {
        try {
          user.connection.send(messageStr);
        } catch (error) {
          console.error(`Failed to send to user ${user.login}:`, error);
        }
      }
    }
  }

  private cleanupInactiveUsers() {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [userId, user] of this.state.users) {
      if (now - user.lastSeen > this.USER_TIMEOUT) {
        toRemove.push(userId);
      }
    }

    for (const userId of toRemove) {
      const user = this.state.users.get(userId);
      if (user) {
        this.state.users.delete(userId);
        
        // Notify others of user leaving
        this.broadcastToOthers({
          type: 'user_left',
          data: {
            id: user.id,
            login: user.login,
            name: user.name,
            avatar_url: user.avatar_url
          },
          userId: user.id,
          timestamp: Date.now()
        }, user.connection);
      }
    }
  }

  private async persistHighlight(highlight: HighlightData) {
    // Placeholder for external persistence (Supabase, Redis, etc.)
    // In production, this would save to your chosen database
    try {
      // await this.database.saveHighlight(highlight);
      console.log(`💾 Persisted highlight: ${highlight.id}`);
    } catch (error) {
      console.error('Failed to persist highlight:', error);
    }
  }

  private async removePersistedHighlight(highlightId: string) {
    // Placeholder for external persistence cleanup
    try {
      // await this.database.removeHighlight(highlightId);
      console.log(`🗑️ Removed persisted highlight: ${highlightId}`);
    } catch (error) {
      console.error('Failed to remove persisted highlight:', error);
    }
  }

  // Optional: Custom error handling
  onError(connection: Connection, error: Error) {
    console.error(`❌ Error in room ${this.party.id}:`, error);
  }
}