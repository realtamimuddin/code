import Redis from 'ioredis';
import { Highlight, User } from '../../../shared/types';

export class RedisService {
  private redis: Redis;
  private pubClient: Redis;
  private subClient: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.redis = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
    
    this.pubClient = new Redis(redisUrl, { lazyConnect: true });
    this.subClient = new Redis(redisUrl, { lazyConnect: true });
  }

  async connect() {
    try {
      await Promise.all([
        this.redis.connect(),
        this.pubClient.connect(),
        this.subClient.connect()
      ]);
      console.log('Redis connected');
    } catch (error) {
      console.error('Redis connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    await Promise.all([
      this.redis.disconnect(),
      this.pubClient.disconnect(),
      this.subClient.disconnect()
    ]);
  }

  // PR Session Management
  async addUserToPRSession(prUrl: string, user: User) {
    const key = this.getPRSessionKey(prUrl);
    const userKey = `user:${user.id}`;
    
    await this.redis.multi()
      .hset(key, userKey, JSON.stringify(user))
      .expire(key, 3600) // 1 hour expiry
      .exec();
  }

  async removeUserFromPRSession(prUrl: string, userId: string) {
    const key = this.getPRSessionKey(prUrl);
    const userKey = `user:${userId}`;
    
    await this.redis.hdel(key, userKey);
  }

  async getPRSessionUsers(prUrl: string): Promise<User[]> {
    const key = this.getPRSessionKey(prUrl);
    const userData = await this.redis.hgetall(key);
    
    return Object.values(userData)
      .map(userStr => {
        try {
          return JSON.parse(userStr) as User;
        } catch {
          return null;
        }
      })
      .filter((user): user is User => user !== null);
  }

  // Highlight Caching
  async cacheHighlight(highlight: Highlight) {
    const key = this.getHighlightKey(highlight.id);
    await this.redis.setex(key, 3600, JSON.stringify(highlight));
    
    // Also add to PR highlights set
    const prKey = this.getPRHighlightsKey(highlight.prUrl);
    await this.redis.sadd(prKey, highlight.id);
    await this.redis.expire(prKey, 3600);
  }

  async getHighlight(highlightId: string): Promise<Highlight | null> {
    const key = this.getHighlightKey(highlightId);
    const data = await this.redis.get(key);
    
    if (data) {
      try {
        return JSON.parse(data) as Highlight;
      } catch {
        return null;
      }
    }
    
    return null;
  }

  async removeHighlight(highlightId: string) {
    const highlight = await this.getHighlight(highlightId);
    if (highlight) {
      const prKey = this.getPRHighlightsKey(highlight.prUrl);
      await this.redis.srem(prKey, highlightId);
    }
    
    const key = this.getHighlightKey(highlightId);
    await this.redis.del(key);
  }

  async updateHighlight(highlightId: string, changes: Partial<Highlight>) {
    const highlight = await this.getHighlight(highlightId);
    if (highlight) {
      const updated = { ...highlight, ...changes };
      await this.cacheHighlight(updated);
    }
  }

  async getPRHighlights(prUrl: string): Promise<Highlight[]> {
    const prKey = this.getPRHighlightsKey(prUrl);
    const highlightIds = await this.redis.smembers(prKey);
    
    if (highlightIds.length === 0) return [];
    
    const pipeline = this.redis.pipeline();
    highlightIds.forEach(id => {
      pipeline.get(this.getHighlightKey(id));
    });
    
    const results = await pipeline.exec();
    
    return (results || [])
      .map(([err, data]) => {
        if (err || !data) return null;
        try {
          return JSON.parse(data as string) as Highlight;
        } catch {
          return null;
        }
      })
      .filter((highlight): highlight is Highlight => highlight !== null);
  }

  // Rate Limiting
  async checkRateLimit(userId: string, action: string, limit: number, window: number): Promise<boolean> {
    const key = `rate_limit:${userId}:${action}`;
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, window);
    }
    
    return current <= limit;
  }

  // Pub/Sub for real-time features
  async publishHighlightEvent(prUrl: string, event: string, data: any) {
    const channel = this.getPRChannelName(prUrl);
    await this.pubClient.publish(channel, JSON.stringify({ event, data }));
  }

  async subscribeToHighlightEvents(prUrl: string, callback: (event: string, data: any) => void) {
    const channel = this.getPRChannelName(prUrl);
    
    this.subClient.subscribe(channel);
    this.subClient.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const { event, data } = JSON.parse(message);
          callback(event, data);
        } catch (error) {
          console.error('Error parsing pub/sub message:', error);
        }
      }
    });
  }

  // Conflict Resolution
  async acquireLock(resource: string, ttl: number = 5000): Promise<boolean> {
    const key = `lock:${resource}`;
    const lockId = `${Date.now()}-${Math.random()}`;
    
    const result = await this.redis.set(key, lockId, 'PX', ttl, 'NX');
    return result === 'OK';
  }

  async releaseLock(resource: string) {
    const key = `lock:${resource}`;
    await this.redis.del(key);
  }

  // Helper methods
  private getPRSessionKey(prUrl: string): string {
    return `pr_session:${this.hashUrl(prUrl)}`;
  }

  private getPRHighlightsKey(prUrl: string): string {
    return `pr_highlights:${this.hashUrl(prUrl)}`;
  }

  private getHighlightKey(highlightId: string): string {
    return `highlight:${highlightId}`;
  }

  private getPRChannelName(prUrl: string): string {
    return `pr_events:${this.hashUrl(prUrl)}`;
  }

  private hashUrl(url: string): string {
    return Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  }
}