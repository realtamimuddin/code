# Deployment Guide

This guide covers deploying the Code Review Highlights extension and backend to production.

## 🌐 Backend Deployment

### Option 1: Railway (Recommended)

Railway provides easy deployment with built-in PostgreSQL and Redis.

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project
railway init

# Add PostgreSQL and Redis services
railway add --service postgresql
railway add --service redis

# Set environment variables
railway variables set GITHUB_CLIENT_ID=your_client_id
railway variables set GITHUB_CLIENT_SECRET=your_client_secret
railway variables set JWT_SECRET=your_secure_secret
railway variables set NODE_ENV=production

# Deploy
railway up
```

### Option 2: DigitalOcean App Platform

1. Create a new app on DigitalOcean
2. Connect your GitHub repository
3. Configure build settings:
   - **Source Directory**: `/backend`
   - **Build Command**: `npm run build`
   - **Run Command**: `npm start`
4. Add managed PostgreSQL and Redis databases
5. Set environment variables in the dashboard

### Option 3: AWS (Advanced)

#### Prerequisites
- AWS CLI configured
- Docker installed

```bash
# Build Docker image
cd backend
docker build -t code-highlights-backend .

# Tag for ECR
docker tag code-highlights-backend:latest YOUR_ECR_REPO_URI:latest

# Push to ECR
docker push YOUR_ECR_REPO_URI:latest

# Deploy with ECS or EKS
# Use provided terraform/cloudformation templates
```

### Option 4: Google Cloud Platform

```bash
# Install gcloud CLI
# Initialize project: gcloud init

cd backend

# Create app.yaml
cat > app.yaml << EOF
runtime: nodejs18
env: standard
instance_class: F2

env_variables:
  NODE_ENV: production
  DATABASE_URL: your_database_url
  REDIS_URL: your_redis_url
  GITHUB_CLIENT_ID: your_client_id
  GITHUB_CLIENT_SECRET: your_client_secret
  JWT_SECRET: your_jwt_secret

automatic_scaling:
  min_instances: 1
  max_instances: 10
EOF

# Deploy
gcloud app deploy
```

## 🏪 Extension Store Submission

### Chrome Web Store

1. **Prepare Extension Package**
   ```bash
   cd extension
   npm run build
   zip -r extension.zip build/
   ```

2. **Developer Dashboard Setup**
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
   - Pay the $5 registration fee
   - Create new item

3. **Upload and Configure**
   - Upload the extension.zip file
   - Fill in store listing details:
     - **Name**: Code Review Highlights
     - **Description**: Real-time collaborative highlighting for GitHub pull requests
     - **Category**: Developer Tools
     - **Screenshots**: Provide 1280x800 screenshots
     - **Icon**: 128x128 PNG icon

4. **Privacy and Permissions**
   - Add privacy policy URL
   - Justify permissions usage:
     - `storage`: Store user authentication
     - `activeTab`: Access GitHub pages
     - `identity`: GitHub OAuth authentication

5. **Submit for Review**
   - Complete all required fields
   - Submit for review (typically 1-3 business days)

### Firefox Add-ons (AMO)

1. **Create Developer Account**
   - Go to [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
   - Create account and verify email

2. **Prepare Manifest for Firefox**
   ```json
   {
     "manifest_version": 2,
     "applications": {
       "gecko": {
         "id": "code-highlights@yourcompany.com",
         "strict_min_version": "91.0"
       }
     }
   }
   ```

3. **Upload Extension**
   - Create new add-on
   - Upload ZIP file
   - Complete listing information

4. **Review Process**
   - Automated review for basic checks
   - Manual review for complex permissions
   - Typically 1-7 days

## 🔧 Production Configuration

### Environment Variables

Create production environment files:

```bash
# backend/.env.production
DATABASE_URL=postgresql://user:pass@prod-db:5432/highlights
REDIS_URL=redis://prod-redis:6379
GITHUB_CLIENT_ID=prod_client_id
GITHUB_CLIENT_SECRET=prod_client_secret
JWT_SECRET=secure_production_secret
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=chrome-extension://published-extension-id,moz-extension://firefox-extension-id
```

### SSL/TLS Setup

For custom domains, set up SSL certificates:

```bash
# Using Certbot (Let's Encrypt)
sudo apt install certbot
sudo certbot --nginx -d your-domain.com
```

### Database Migrations

Run production migrations:

```bash
# Backup existing data
pg_dump $DATABASE_URL > backup.sql

# Run migrations
npm run db:migrate

# Verify deployment
npm run db:status
```

## 📊 Monitoring and Analytics

### Application Monitoring

1. **Error Tracking (Sentry)**
   ```bash
   npm install @sentry/node @sentry/integrations
   ```

   ```typescript
   // In your main server file
   import * as Sentry from '@sentry/node';
   
   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV
   });
   ```

2. **Performance Monitoring**
   - Set up health check endpoints
   - Monitor WebSocket connections
   - Track response times

3. **Logging**
   ```typescript
   import winston from 'winston';
   
   const logger = winston.createLogger({
     level: 'info',
     format: winston.format.json(),
     transports: [
       new winston.transports.File({ filename: 'error.log', level: 'error' }),
       new winston.transports.File({ filename: 'combined.log' })
     ]
   });
   ```

### Extension Analytics

1. **Google Analytics for Extensions**
   ```typescript
   // In background script
   const TRACKING_ID = 'UA-XXXXXXXX-X';
   
   function trackEvent(category: string, action: string) {
     fetch(`https://www.google-analytics.com/collect?v=1&tid=${TRACKING_ID}&cid=${userId}&t=event&ec=${category}&ea=${action}`);
   }
   ```

## 🚀 CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: |
          cd backend
          npm ci
          
      - name: Run tests
        run: |
          cd backend
          npm test
          
      - name: Deploy to Railway
        run: |
          npm install -g @railway/cli
          railway login --token ${{ secrets.RAILWAY_TOKEN }}
          railway up
          
  build-extension:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Build extension
        run: |
          cd extension
          npm ci
          npm run build
          
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: extension-build
          path: extension/build/
```

## 🔐 Security Checklist

### Pre-deployment Security

- [ ] Environment variables secured
- [ ] Database credentials rotated
- [ ] HTTPS/WSS enabled
- [ ] CORS properly configured
- [ ] Rate limiting implemented
- [ ] Input validation added
- [ ] SQL injection prevention
- [ ] XSS protection enabled
- [ ] Authentication tokens secured
- [ ] Secrets management in place

### Extension Security

- [ ] Minimal permissions requested
- [ ] Content Security Policy defined
- [ ] Secure communication protocols
- [ ] User data encryption
- [ ] Privacy policy created
- [ ] Data retention policy defined

## 📈 Scaling Considerations

### Horizontal Scaling

1. **Load Balancing**
   ```nginx
   upstream backend {
       server backend1:3000;
       server backend2:3000;
   }
   
   server {
       location / {
           proxy_pass http://backend;
       }
   }
   ```

2. **Redis Clustering**
   ```bash
   # Configure Redis cluster for high availability
   redis-cli --cluster create \
     node1:7000 node2:7000 node3:7000 \
     node4:7000 node5:7000 node6:7000 \
     --cluster-replicas 1
   ```

3. **Database Scaling**
   - Read replicas for query distribution
   - Connection pooling
   - Query optimization
   - Proper indexing

## 🔄 Updates and Maintenance

### Extension Updates

1. **Version Management**
   - Increment version in manifest.json
   - Update changelog
   - Test compatibility

2. **Store Updates**
   - Upload new version to stores
   - Update store descriptions
   - Monitor review process

### Backend Updates

1. **Zero-downtime Deployments**
   ```bash
   # Blue-green deployment
   railway up --environment=staging
   # Test staging environment
   railway promote --environment=staging
   ```

2. **Database Migrations**
   ```bash
   # Create migration
   npx prisma migrate dev --name add_new_feature
   
   # Deploy migration
   npx prisma migrate deploy
   ```

## 📞 Support and Monitoring

### Health Checks

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

### Alerting

Set up alerts for:
- Server downtime
- High error rates
- Database connection issues
- Redis connection failures
- Extension crash reports

---

This completes the production deployment setup for Code Review Highlights!