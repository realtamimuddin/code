import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../services/redis-service';
import { DatabaseService } from '../services/database-service';
import { AuthService } from '../services/auth-service';
import { Highlight, User, SocketEvents } from '../../../shared/types';

// Validation schemas
const highlightSchema = z.object({
  prUrl: z.string().url(),
  fileName: z.string(),
  lineNumber: z.number().int().positive(),
  userId: z.string(),
  username: z.string(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  content: z.string().optional()
});

const userSchema = z.object({
  id: z.string(),
  githubId: z.string(),
  username: z.string(),
  avatar: z.string().url(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i)
});

export class SocketHandler {
  private connectedUsers = new Map<string, { socket: Socket; user: User; prUrl?: string }>();

  constructor(
    private io: Server,
    private redis: RedisService,
    private db: DatabaseService,
    private auth: AuthService
  ) {}

  initialize() {
    this.io.on('connection', (socket) => {
      console.log(`Socket connected: ${socket.id}`);
      
      // Authentication middleware
      socket.use(async (packet, next) => {
        try {
          const token = socket.handshake.auth.token;
          if (!token) {
            throw new Error('No authentication token');
          }
          
          const user = await this.auth.verifyToken(token);
          (socket as any).user = user;
          next();
        } catch (error) {
          next(new Error('Authentication failed'));
        }
      });

      this.setupEventHandlers(socket);
    });
  }

  private setupEventHandlers(socket: Socket) {
    socket.on('join-pr', async (data: { prUrl: string; user: User }) => {
      await this.handleJoinPR(socket, data);
    });

    socket.on('leave-pr', async (data: { prUrl: string; userId: string }) => {
      await this.handleLeavePR(socket, data);
    });

    socket.on('create-highlight', async (data: Omit<Highlight, 'id' | 'timestamp'>) => {
      await this.handleCreateHighlight(socket, data);
    });

    socket.on('delete-highlight', async (data: { highlightId: string; userId: string }) => {
      await this.handleDeleteHighlight(socket, data);
    });

    socket.on('update-highlight', async (data: { highlightId: string; changes: Partial<Highlight>; userId: string }) => {
      await this.handleUpdateHighlight(socket, data);
    });

    socket.on('disconnect', async () => {
      await this.handleDisconnect(socket);
    });
  }

  private async handleJoinPR(socket: Socket, data: { prUrl: string; user: User }) {
    try {
      // Validate input
      const { prUrl, user } = data;
      userSchema.parse(user);

      // Check repository access
      const hasAccess = await this.auth.checkRepositoryAccess(user.githubId, prUrl);
      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied to this repository' });
        return;
      }

      // Join socket room
      const roomName = this.getPRRoomName(prUrl);
      await socket.join(roomName);

      // Store user connection
      this.connectedUsers.set(socket.id, { socket, user, prUrl });

      // Add user to Redis session
      await this.redis.addUserToPRSession(prUrl, user);

      // Get existing highlights for this PR
      const highlights = await this.db.getHighlightsForPR(prUrl);
      
      // Send existing highlights to the joining user
      socket.emit('highlights-sync', { highlights });

      // Notify other users in the room
      socket.to(roomName).emit('user-joined', { user });

      console.log(`User ${user.username} joined PR: ${prUrl}`);
    } catch (error) {
      console.error('Error joining PR:', error);
      socket.emit('error', { message: 'Failed to join PR session' });
    }
  }

  private async handleLeavePR(socket: Socket, data: { prUrl: string; userId: string }) {
    try {
      const { prUrl, userId } = data;
      const roomName = this.getPRRoomName(prUrl);
      
      // Leave socket room
      await socket.leave(roomName);

      // Remove from Redis session
      await this.redis.removeUserFromPRSession(prUrl, userId);

      // Notify other users
      socket.to(roomName).emit('user-left', { userId });

      // Update connection tracking
      const connection = this.connectedUsers.get(socket.id);
      if (connection) {
        connection.prUrl = undefined;
      }

      console.log(`User ${userId} left PR: ${prUrl}`);
    } catch (error) {
      console.error('Error leaving PR:', error);
    }
  }

  private async handleCreateHighlight(socket: Socket, data: Omit<Highlight, 'id' | 'timestamp'>) {
    try {
      // Validate input
      highlightSchema.parse(data);

      const connection = this.connectedUsers.get(socket.id);
      if (!connection || !connection.prUrl) {
        socket.emit('error', { message: 'Not in a PR session' });
        return;
      }

      // Verify user owns this highlight
      if (data.userId !== connection.user.id) {
        socket.emit('error', { message: 'Cannot create highlight for another user' });
        return;
      }

      // Check for conflicts (same line, different users)
      const existingHighlight = await this.db.getHighlightForLine(
        data.prUrl, 
        data.fileName, 
        data.lineNumber
      );

      if (existingHighlight && existingHighlight.userId !== data.userId) {
        // Conflict resolution: Last writer wins with notification
        await this.db.deleteHighlight(existingHighlight.id);
        
        // Notify about the conflict
        const roomName = this.getPRRoomName(data.prUrl);
        this.io.to(roomName).emit('highlight-deleted', { highlightId: existingHighlight.id });
      }

      // Create new highlight
      const highlight: Highlight = {
        ...data,
        id: uuidv4(),
        timestamp: new Date()
      };

      // Save to database
      await this.db.createHighlight(highlight);

      // Cache in Redis for fast access
      await this.redis.cacheHighlight(highlight);

      // Broadcast to all users in the PR
      const roomName = this.getPRRoomName(data.prUrl);
      this.io.to(roomName).emit('highlight-created', { highlight });

      console.log(`Highlight created by ${data.username} on ${data.fileName}:${data.lineNumber}`);
    } catch (error) {
      console.error('Error creating highlight:', error);
      socket.emit('error', { message: 'Failed to create highlight' });
    }
  }

  private async handleDeleteHighlight(socket: Socket, data: { highlightId: string; userId: string }) {
    try {
      const connection = this.connectedUsers.get(socket.id);
      if (!connection || !connection.prUrl) {
        socket.emit('error', { message: 'Not in a PR session' });
        return;
      }

      // Get highlight to verify ownership
      const highlight = await this.db.getHighlight(data.highlightId);
      if (!highlight) {
        socket.emit('error', { message: 'Highlight not found' });
        return;
      }

      // Verify user owns this highlight
      if (highlight.userId !== data.userId) {
        socket.emit('error', { message: 'Cannot delete another user\'s highlight' });
        return;
      }

      // Delete from database
      await this.db.deleteHighlight(data.highlightId);

      // Remove from Redis cache
      await this.redis.removeHighlight(data.highlightId);

      // Broadcast deletion to all users in the PR
      const roomName = this.getPRRoomName(highlight.prUrl);
      this.io.to(roomName).emit('highlight-deleted', { highlightId: data.highlightId });

      console.log(`Highlight ${data.highlightId} deleted by ${data.userId}`);
    } catch (error) {
      console.error('Error deleting highlight:', error);
      socket.emit('error', { message: 'Failed to delete highlight' });
    }
  }

  private async handleUpdateHighlight(socket: Socket, data: { highlightId: string; changes: Partial<Highlight>; userId: string }) {
    try {
      const connection = this.connectedUsers.get(socket.id);
      if (!connection || !connection.prUrl) {
        socket.emit('error', { message: 'Not in a PR session' });
        return;
      }

      // Get highlight to verify ownership
      const highlight = await this.db.getHighlight(data.highlightId);
      if (!highlight) {
        socket.emit('error', { message: 'Highlight not found' });
        return;
      }

      // Verify user owns this highlight
      if (highlight.userId !== data.userId) {
        socket.emit('error', { message: 'Cannot update another user\'s highlight' });
        return;
      }

      // Update in database
      await this.db.updateHighlight(data.highlightId, data.changes);

      // Update Redis cache
      await this.redis.updateHighlight(data.highlightId, data.changes);

      // Broadcast update to all users in the PR
      const roomName = this.getPRRoomName(highlight.prUrl);
      this.io.to(roomName).emit('highlight-updated', { 
        highlightId: data.highlightId, 
        changes: data.changes 
      });

      console.log(`Highlight ${data.highlightId} updated by ${data.userId}`);
    } catch (error) {
      console.error('Error updating highlight:', error);
      socket.emit('error', { message: 'Failed to update highlight' });
    }
  }

  private async handleDisconnect(socket: Socket) {
    const connection = this.connectedUsers.get(socket.id);
    if (connection && connection.prUrl) {
      // Remove user from PR session
      await this.redis.removeUserFromPRSession(connection.prUrl, connection.user.id);
      
      // Notify other users
      const roomName = this.getPRRoomName(connection.prUrl);
      socket.to(roomName).emit('user-left', { userId: connection.user.id });
    }

    this.connectedUsers.delete(socket.id);
    console.log(`Socket disconnected: ${socket.id}`);
  }

  private getPRRoomName(prUrl: string): string {
    // Extract org/repo/pr from URL and create room name
    const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
    if (match) {
      return `pr:${match[1]}:${match[2]}:${match[3]}`;
    }
    // Fallback to URL hash
    return `pr:${Buffer.from(prUrl).toString('base64')}`;
  }
}