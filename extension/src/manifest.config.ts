import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest(async () => ({
  manifest_version: 3,
  name: 'Code Review Highlight',
  version: '0.1.0',
  description: 'Real-time collaborative highlights on GitHub PRs',
  permissions: [
    'storage',
    'tabs',
    'activeTab'
  ],
  host_permissions: [
    'https://github.com/*',
    'https://api.github.com/*'
  ],
  background: {
    service_worker: 'background/index.ts',
    type: 'module'
  },
  action: {
    default_popup: 'popup/index.html'
  },
  content_scripts: [
    {
      matches: ['https://github.com/*/*/pull/*'],
      js: ['content/index.ts'],
      run_at: 'document_idle'
    }
  ],
  web_accessible_resources: [
    {
      resources: [],
      matches: ['https://github.com/*']
    }
  ]
}));

