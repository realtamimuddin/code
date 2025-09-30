# Code Review Highlights

A real-time, collaborative browser extension that allows users to highlight lines of code directly on GitHub pull request pages. Highlights are visible in real-time to other users viewing the same PR.

## 🚀 Features

- **Real-time Collaboration**: See highlights from other team members instantly
- **GitHub Integration**: Works seamlessly with GitHub pull requests
- **User Authentication**: Secure GitHub OAuth integration
- **Conflict Resolution**: Smart handling of overlapping highlights
- **Performance Optimized**: Minimal impact on GitHub page load times
- **Cross-browser Support**: Compatible with Chrome and Firefox

## 🏗️ Architecture

### Frontend (Browser Extension)
- **Content Script**: Injects overlay system into GitHub pages
- **Background Script**: Manages authentication and communication
- **Popup UI**: React-based user interface with Tailwind CSS
- **Real-time Sync**: Socket.io client for instant updates

### Backend (Node.js Server)
- **WebSocket Server**: Socket.io for real-time communication
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis for fast state management
- **Authentication**: GitHub OAuth with JWT tokens

## 📦 Project Structure

```
code-review-highlights/
├── extension/          # Browser extension
│   ├── src/
│   │   ├── content/    # Content scripts
│   │   ├── background/ # Background service worker
│   │   ├── popup/      # React popup UI
│   │   └── utils/      # Shared utilities
│   └── public/         # Static assets
├── backend/            # Node.js server
│   ├── src/
│   │   ├── services/   # Core services
│   │   └── socket/     # WebSocket handlers
│   └── prisma/         # Database schema
└── shared/             # Shared TypeScript types
```

## 🛠️ Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Redis server
- GitHub OAuth App

### 1. GitHub OAuth Setup

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Code Review Highlights
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `chrome-extension://YOUR_EXTENSION_ID/`
4. Save the Client ID and Client Secret

### 2. Database Setup

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb code_highlights

# Create user
sudo -u postgres psql -c "CREATE USER highlights_user WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE code_highlights TO highlights_user;"
```

### 3. Redis Setup

```bash
# Install Redis (Ubuntu/Debian)
sudo apt install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### 4. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

### 5. Extension Setup

```bash
cd extension

# Install dependencies
npm install

# Build extension
npm run build
```

### 6. Load Extension in Browser

#### Chrome:
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/build` directory

#### Firefox:
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select any file in the `extension/build` directory

## 🔧 Configuration

### Environment Variables

#### Backend (.env)
```env
DATABASE_URL="postgresql://highlights_user:your_password@localhost:5432/code_highlights"
REDIS_URL="redis://localhost:6379"
GITHUB_CLIENT_ID="your_github_client_id"
GITHUB_CLIENT_SECRET="your_github_client_secret"
JWT_SECRET="your_secure_random_string"
PORT=3000
ALLOWED_ORIGINS="chrome-extension://your-extension-id"
```

#### Extension
Update the manifest.json with your backend URL and GitHub client ID.

## 🚀 Usage

1. **Authentication**: Click the extension icon and sign in with GitHub
2. **Highlighting**: 
   - Navigate to any GitHub pull request
   - Select text and it will be highlighted automatically
   - Press `Ctrl+H` to toggle highlight mode
3. **Collaboration**: Other users with the extension will see your highlights in real-time

## 🧪 Development

### Running Tests
```bash
# Backend tests
cd backend
npm test

# Extension tests
cd extension
npm test
```

### Development Workflow
1. Start the backend server: `npm run dev`
2. Build extension in watch mode: `npm run dev`
3. Reload extension in browser after changes
4. Use browser dev tools for debugging

## 🔒 Security Considerations

- All communication uses HTTPS/WSS
- GitHub OAuth tokens are encrypted
- Rate limiting prevents abuse
- Input sanitization prevents XSS
- Repository access validation

## 📈 Performance

- < 100ms highlight creation latency
- < 500ms real-time sync latency
- < 5% impact on GitHub page load
- Graceful degradation for slow connections

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🐛 Troubleshooting

### Common Issues

**Extension not loading**
- Check if all files are built correctly
- Verify manifest.json syntax
- Check browser console for errors

**Authentication failing**
- Verify GitHub OAuth app configuration
- Check if redirect URL matches
- Ensure backend server is running

**Highlights not syncing**
- Check WebSocket connection in browser dev tools
- Verify Redis server is running
- Check backend logs for errors

**Performance issues**
- Disable other extensions temporarily
- Check if GitHub page is fully loaded
- Monitor network traffic

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting guide
- Review the project documentation

---

Built with ❤️ for better code collaboration