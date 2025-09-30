import { io, Socket } from 'socket.io-client';
import { Highlight, User, SocketEvents } from '../../../shared/types';

export class SocketManager {
  private socket: Socket | null = null;
  private serverUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;

  constructor() {
    this.serverUrl = process.env.REACT_APP_SERVER_URL || 'ws://localhost:3000';
  }

  async connect(): Promise<void> {
    if (this.socket?.connected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        // Get auth token from storage
        chrome.storage.local.get(['authToken'], (result) => {
          const token = result.authToken;
          if (!token) {
            reject(new Error('No authentication token found'));
            return;
          }

          this.socket = io(this.serverUrl, {
            auth: { token },
            transports: ['websocket', 'polling'],
            timeout: 20000,
            forceNew: true
          });

          this.socket.on('connect', () => {
            console.log('Socket connected');
            this.reconnectAttempts = 0;
            this.isConnecting = false;
            resolve();
          });

          this.socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            this.isConnecting = false;
            
            if (reason === 'io server disconnect') {
              // Server initiated disconnect, don't reconnect automatically
              return;
            }
            
            this.handleReconnect();
          });

          this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            this.isConnecting = false;
            
            if (this.reconnectAttempts === 0) {
              reject(error);
            }
            
            this.handleReconnect();
          });

          this.socket.on('error', (error) => {
            console.error('Socket error:', error);
          });
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (!this.socket?.connected && !this.isConnecting) {
        this.connect().catch(console.error);
      }
    }, delay);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  // Event listeners
  on<K extends keyof SocketEvents>(event: K, callback: (data: SocketEvents[K]) => void) {
    if (this.socket) {
      this.socket.on(event as string, callback);
    }
  }

  off<K extends keyof SocketEvents>(event: K, callback?: (data: SocketEvents[K]) => void) {
    if (this.socket) {
      this.socket.off(event as string, callback);
    }
  }

  // PR session management
  async joinPR(prUrl: string, user: User): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Join PR timeout'));
      }, 10000);

      this.socket!.emit('join-pr', { prUrl, user });
      
      const onError = (error: { message: string }) => {
        clearTimeout(timeout);
        this.socket!.off('highlights-sync', onSync);
        reject(new Error(error.message));
      };

      const onSync = () => {
        clearTimeout(timeout);
        this.socket!.off('error', onError);
        resolve();
      };

      this.socket!.once('error', onError);
      this.socket!.once('highlights-sync', onSync);
    });
  }

  async leavePR(prUrl: string, userId: string): Promise<void> {
    if (this.socket?.connected) {
      this.socket.emit('leave-pr', { prUrl, userId });
    }
  }

  // Highlight management
  async createHighlight(highlight: Omit<Highlight, 'id' | 'timestamp'>): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Create highlight timeout'));
      }, 5000);

      this.socket!.emit('create-highlight', highlight);
      
      const onError = (error: { message: string }) => {
        clearTimeout(timeout);
        this.socket!.off('highlight-created', onCreated);
        reject(new Error(error.message));
      };

      const onCreated = () => {
        clearTimeout(timeout);
        this.socket!.off('error', onError);
        resolve();
      };

      this.socket!.once('error', onError);
      this.socket!.once('highlight-created', onCreated);
    });
  }

  async deleteHighlight(highlightId: string, userId: string): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Delete highlight timeout'));
      }, 5000);

      this.socket!.emit('delete-highlight', { highlightId, userId });
      
      const onError = (error: { message: string }) => {
        clearTimeout(timeout);
        this.socket!.off('highlight-deleted', onDeleted);
        reject(new Error(error.message));
      };

      const onDeleted = () => {
        clearTimeout(timeout);
        this.socket!.off('error', onError);
        resolve();
      };

      this.socket!.once('error', onError);
      this.socket!.once('highlight-deleted', onDeleted);
    });
  }

  async updateHighlight(highlightId: string, changes: Partial<Highlight>, userId: string): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Update highlight timeout'));
      }, 5000);

      this.socket!.emit('update-highlight', { highlightId, changes, userId });
      
      const onError = (error: { message: string }) => {
        clearTimeout(timeout);
        this.socket!.off('highlight-updated', onUpdated);
        reject(new Error(error.message));
      };

      const onUpdated = () => {
        clearTimeout(timeout);
        this.socket!.off('error', onError);
        resolve();
      };

      this.socket!.once('error', onError);
      this.socket!.once('highlight-updated', onUpdated);
    });
  }

  // Connection status
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getConnectionState(): 'connected' | 'connecting' | 'disconnected' {
    if (this.socket?.connected) return 'connected';
    if (this.isConnecting) return 'connecting';
    return 'disconnected';
  }
}