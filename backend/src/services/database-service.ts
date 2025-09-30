import { PrismaClient } from '@prisma/client';
import { Highlight, User } from '../../../shared/types';

export class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  async connect() {
    try {
      await this.prisma.$connect();
      console.log('Database connected');
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }

  // User management
  async createUser(userData: {
    githubId: string;
    username: string;
    email?: string;
    avatar: string;
    color?: string;
  }) {
    return await this.prisma.user.create({
      data: userData
    });
  }

  async getUserByGithubId(githubId: string) {
    return await this.prisma.user.findUnique({
      where: { githubId }
    });
  }

  async getUserById(id: string) {
    return await this.prisma.user.findUnique({
      where: { id }
    });
  }

  async updateUser(id: string, updates: Partial<{
    username: string;
    email: string;
    avatar: string;
    color: string;
  }>) {
    return await this.prisma.user.update({
      where: { id },
      data: updates
    });
  }

  // Highlight management
  async createHighlight(highlight: Highlight) {
    return await this.prisma.highlight.create({
      data: {
        id: highlight.id,
        prUrl: highlight.prUrl,
        fileName: highlight.fileName,
        lineNumber: highlight.lineNumber,
        content: highlight.content,
        color: highlight.color,
        timestamp: highlight.timestamp,
        userId: highlight.userId
      }
    });
  }

  async getHighlight(id: string): Promise<Highlight | null> {
    const highlight = await this.prisma.highlight.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!highlight) return null;

    return {
      id: highlight.id,
      prUrl: highlight.prUrl,
      fileName: highlight.fileName,
      lineNumber: highlight.lineNumber,
      content: highlight.content || undefined,
      color: highlight.color,
      timestamp: highlight.timestamp,
      userId: highlight.userId,
      username: highlight.user.username
    };
  }

  async getHighlightsForPR(prUrl: string): Promise<Highlight[]> {
    const highlights = await this.prisma.highlight.findMany({
      where: { prUrl },
      include: { user: true },
      orderBy: { timestamp: 'asc' }
    });

    return highlights.map(highlight => ({
      id: highlight.id,
      prUrl: highlight.prUrl,
      fileName: highlight.fileName,
      lineNumber: highlight.lineNumber,
      content: highlight.content || undefined,
      color: highlight.color,
      timestamp: highlight.timestamp,
      userId: highlight.userId,
      username: highlight.user.username
    }));
  }

  async getHighlightForLine(prUrl: string, fileName: string, lineNumber: number): Promise<Highlight | null> {
    const highlight = await this.prisma.highlight.findUnique({
      where: {
        prUrl_fileName_lineNumber: {
          prUrl,
          fileName,
          lineNumber
        }
      },
      include: { user: true }
    });

    if (!highlight) return null;

    return {
      id: highlight.id,
      prUrl: highlight.prUrl,
      fileName: highlight.fileName,
      lineNumber: highlight.lineNumber,
      content: highlight.content || undefined,
      color: highlight.color,
      timestamp: highlight.timestamp,
      userId: highlight.userId,
      username: highlight.user.username
    };
  }

  async updateHighlight(id: string, changes: Partial<Highlight>) {
    const updateData: any = {};
    
    if (changes.content !== undefined) updateData.content = changes.content;
    if (changes.color !== undefined) updateData.color = changes.color;

    return await this.prisma.highlight.update({
      where: { id },
      data: updateData
    });
  }

  async deleteHighlight(id: string) {
    return await this.prisma.highlight.delete({
      where: { id }
    });
  }

  async deleteHighlightsForPR(prUrl: string) {
    return await this.prisma.highlight.deleteMany({
      where: { prUrl }
    });
  }

  async deleteHighlightsByUser(userId: string) {
    return await this.prisma.highlight.deleteMany({
      where: { userId }
    });
  }

  // Session management
  async createSession(prUrl: string, userId: string) {
    return await this.prisma.session.create({
      data: {
        prUrl,
        userId
      }
    });
  }

  async endSession(prUrl: string, userId: string) {
    return await this.prisma.session.updateMany({
      where: {
        prUrl,
        userId,
        leftAt: null
      },
      data: {
        leftAt: new Date()
      }
    });
  }

  async getActiveSessions(prUrl: string) {
    return await this.prisma.session.findMany({
      where: {
        prUrl,
        leftAt: null
      },
      include: { user: true }
    });
  }

  // Repository management
  async createRepository(data: {
    githubId: string;
    fullName: string;
    isPrivate: boolean;
  }) {
    return await this.prisma.repository.create({
      data
    });
  }

  async getRepository(githubId: string) {
    return await this.prisma.repository.findUnique({
      where: { githubId }
    });
  }

  async updateRepository(githubId: string, updates: {
    fullName?: string;
    isPrivate?: boolean;
  }) {
    return await this.prisma.repository.update({
      where: { githubId },
      data: {
        ...updates,
        lastSyncAt: new Date()
      }
    });
  }

  // Analytics and cleanup
  async getHighlightStats(prUrl?: string) {
    const whereClause = prUrl ? { prUrl } : {};
    
    const [totalHighlights, uniqueUsers, highlightsByFile] = await Promise.all([
      this.prisma.highlight.count({ where: whereClause }),
      this.prisma.highlight.groupBy({
        by: ['userId'],
        where: whereClause,
        _count: { userId: true }
      }),
      this.prisma.highlight.groupBy({
        by: ['fileName'],
        where: whereClause,
        _count: { fileName: true },
        orderBy: { _count: { fileName: 'desc' } }
      })
    ]);

    return {
      totalHighlights,
      uniqueUsers: uniqueUsers.length,
      highlightsByFile: highlightsByFile.slice(0, 10) // Top 10 files
    };
  }

  async cleanupOldSessions(olderThanDays: number = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    return await this.prisma.session.deleteMany({
      where: {
        OR: [
          { leftAt: { lt: cutoffDate } },
          { 
            leftAt: null,
            joinedAt: { lt: cutoffDate }
          }
        ]
      }
    });
  }

  async cleanupOldHighlights(olderThanDays: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    return await this.prisma.highlight.deleteMany({
      where: {
        timestamp: { lt: cutoffDate }
      }
    });
  }
}