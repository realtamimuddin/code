# Code Review Highlight - Deployment Guide

This guide will help you deploy the Code Review Highlight extension and its supporting infrastructure.

## Prerequisites

- Node.js 18+ and npm
- GitHub account with OAuth app creation permissions
- Supabase account (free tier is sufficient for development)
- PartyKit account (free tier available)
- Chrome/Firefox for extension testing

## 1. GitHub OAuth Setup

### Create GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Code Review Highlight
   - **Homepage URL**: `https://your-domain.com` (or localhost for development)
   - **Authorization callback URL**: `https://your-partykit-domain.partykit.dev/auth/callback`
4. Save the **Client ID** and **Client Secret**

### Configure Extension Permissions

Update `extension/manifest.json`:
```json
{
  "oauth2": {
    "client_id": "YOUR_GITHUB_OAUTH_CLIENT_ID",
    "scopes": ["user:email", "repo"]
  }
}
```

## 2. Supabase Setup

### Create Project

1. Go to [Supabase](https://supabase.com) and create a new project
2. Choose a region close to your users
3. Set a strong database password
4. Wait for the project to be ready

### Setup Database Schema

1. Go to SQL Editor in your Supabase dashboard
2. Copy and paste the contents of `server/database/schema.sql`
3. Run the SQL script to create all tables and functions

### Configure Authentication

1. Go to Authentication → Settings
2. Enable GitHub provider:
   - Add your GitHub Client ID and Secret
   - Set redirect URL to your extension's callback

### Get API Keys

From Settings → API:
- Copy the **Project URL**
- Copy the **anon/public key**
- Copy the **service_role key** (keep this secure!)

## 3. PartyKit Server Deployment

### Install Dependencies

```bash
cd server/partykit
npm install
```

### Configure Environment

Update `partykit.json`:
```json
{
  "vars": {
    "GITHUB_CLIENT_ID": "your_github_client_id",
    "GITHUB_CLIENT_SECRET": "your_github_client_secret",
    "SUPABASE_URL": "your_supabase_project_url",
    "SUPABASE_ANON_KEY": "your_supabase_anon_key"
  }
}
```

### Deploy to PartyKit

```bash
# Login to PartyKit
npx partykit login

# Deploy the server
npm run deploy
```

### Get Server URL

After deployment, PartyKit will provide a URL like:
`https://your-project.your-username.partykit.dev`

## 4. Extension Configuration

### Update Manifest

In `extension/manifest.json`, update:
- `oauth2.client_id` with your GitHub Client ID
- `externally_connectable.matches` with your PartyKit URL

### Update Content Script

In `extension/src/content/github-injector.js`, update the WebSocket URL:
```javascript
const wsUrl = `wss://your-project.your-username.partykit.dev/party/${room}`;
```

### Update Background Script

In `extension/src/background/service-worker.js`, update:
- GitHub Client ID and Secret
- Token exchange endpoint (should be your backend)

### Build Extension

```bash
cd extension
# If using a build process
npm run build

# Or manually zip the files
zip -r code-review-highlight.zip src/ manifest.json
```

## 5. Environment Variables Reference

### PartyKit Server (.env.local)
```
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

### Extension Environment
Update these directly in the code files:
- GitHub OAuth Client ID (manifest.json)
- PartyKit server URL (github-injector.js)
- Supabase URL and keys (if using direct Supabase calls)

## 6. Testing Deployment

### Local Testing

1. Load unpacked extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Click "Load unpacked" and select your extension folder

2. Test on a GitHub PR:
   - Navigate to any GitHub pull request
   - Click the extension icon to authenticate
   - Try creating highlights

### Production Testing

1. Deploy all services (Supabase, PartyKit)
2. Update extension with production URLs
3. Test authentication flow
4. Test real-time collaboration with multiple users

## 7. Chrome Web Store Submission

### Prepare Extension Package

1. Remove development files and comments
2. Optimize images and reduce bundle size
3. Create final zip package
4. Prepare store listing materials:
   - Screenshots (1280x800 or 640x400)
   - Detailed description
   - Privacy policy

### Store Listing

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
2. Pay one-time $5 developer fee
3. Upload extension package
4. Fill in store listing details
5. Submit for review (usually takes 1-3 days)

### Privacy Policy Template

```
Code Review Highlight Privacy Policy

Data Collection:
- GitHub account information (username, avatar, email)
- Code highlight data for pull requests you access
- Usage analytics (optional)

Data Storage:
- Highlight data stored in Supabase database
- GitHub tokens stored locally in browser extension storage
- Real-time sync via PartyKit (temporary storage only)

Data Sharing:
- Highlight data shared only with users who have access to the same repository
- No data sold or shared with third parties
- GitHub data access limited to repositories you authorize

Contact: your-email@domain.com
```

## 8. Monitoring and Maintenance

### PartyKit Monitoring

- Check PartyKit dashboard for connection metrics
- Monitor error logs and response times
- Set up alerts for downtime

### Supabase Monitoring

- Monitor database performance and storage usage
- Check real-time subscriptions
- Review authentication metrics

### Extension Analytics

Consider adding analytics to track:
- Extension installation and usage
- Highlight creation frequency
- Error rates and crash reports

## 9. Scaling Considerations

### Database Optimization

- Add indexes for frequently queried fields
- Consider partitioning for large tables
- Monitor query performance

### PartyKit Scaling

- PartyKit auto-scales WebSocket connections
- Monitor room distribution
- Consider geographic distribution for global users

### Rate Limiting

Implement rate limiting for:
- Highlight creation (prevent spam)
- API calls to GitHub
- Real-time message frequency

## 10. Security Checklist

- [ ] GitHub OAuth tokens stored securely
- [ ] Supabase RLS policies properly configured
- [ ] No sensitive data in extension bundle
- [ ] HTTPS/WSS for all communication
- [ ] Content Security Policy implemented
- [ ] Input validation on all user data
- [ ] Regular dependency updates

## 11. Troubleshooting

### Common Issues

**Authentication fails:**
- Check GitHub OAuth configuration
- Verify redirect URLs match exactly
- Check browser extension permissions

**Highlights not syncing:**
- Verify PartyKit server is running
- Check WebSocket connection in browser dev tools
- Confirm Supabase real-time subscriptions

**Permission errors:**
- Review Supabase RLS policies
- Check repository access in database
- Verify user authentication state

### Debug Mode

Enable debug logging by adding to content script:
```javascript
localStorage.setItem('crh-debug', 'true');
```

### Support

For deployment issues:
1. Check all service status pages
2. Review browser extension console logs
3. Monitor network requests in dev tools
4. Test with minimal reproduction case

## 12. Production Readiness Checklist

- [ ] All services deployed and configured
- [ ] OAuth flow working end-to-end
- [ ] Real-time sync functioning
- [ ] Database performance optimized
- [ ] Error handling implemented
- [ ] Privacy policy published
- [ ] Documentation complete
- [ ] Backup and recovery plan
- [ ] Monitoring and alerts configured
- [ ] Security review completed

---

## Quick Start Commands

```bash
# 1. Setup database
# Copy schema.sql to Supabase SQL editor and run

# 2. Deploy PartyKit
cd server/partykit
npm install
npm run deploy

# 3. Package extension
cd extension
zip -r code-review-highlight.zip src/ manifest.json

# 4. Load in Chrome
# Go to chrome://extensions/, enable dev mode, load unpacked
```

This completes the deployment setup for the Code Review Highlight extension!