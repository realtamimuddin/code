import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { SocketHandler } from './socket/socket-handler';
import { DatabaseService } from './services/database-service';
import { RedisService } from './services/redis-service';
import { AuthService } from './services/auth-service';

dotenv.config();

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['chrome-extension://*'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['chrome-extension://*'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Initialize services
const redisService = new RedisService();
const databaseService = new DatabaseService();
const authService = new AuthService();
const socketHandler = new SocketHandler(io, redisService, databaseService, authService);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// GitHub OAuth callback endpoint
app.post('/auth/github', async (req, res) => {
  try {
    const { code } = req.body;
    const result = await authService.handleGitHubCallback(code);
    res.json(result);
  } catch (error) {
    console.error('GitHub auth error:', error);
    res.status(400).json({ error: 'Authentication failed' });
  }
});

// User info endpoint
app.get('/auth/user', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const user = await authService.verifyToken(token);
    res.json(user);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Initialize socket handlers
socketHandler.initialize();

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await redisService.connect();
    await databaseService.connect();
    
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await redisService.disconnect();
  await databaseService.disconnect();
  server.close();
});

start();