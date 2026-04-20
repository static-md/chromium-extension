import { defineManifest } from '@crxjs/vite-plugin';

// MV3 manifest for StaticShot. @crxjs resolves script/html entry paths and handles
// the web_accessible_resources wiring for content scripts; we additionally expose
// the editor HTML so `chrome.tabs.create({url: runtime.getURL('index.html')})` works
// from any origin.
export default defineManifest({
  manifest_version: 3,
  name: 'StaticShot - Screenshot to Notes & Images',
  short_name: 'StaticShot',
  description:
    'Capture, annotate, and save screenshots as markdown notes or images on Static.md',
  version: '2.0.2',
  icons: {
    '16': 'icons/16.png',
    '48': 'icons/48.png',
    '128': 'icons/128.png',
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  action: {
    default_icon: 'icons/48.png',
    default_title: 'Capture the page',
  },
  permissions: ['activeTab', 'storage', 'scripting'],
  host_permissions: ['https://static.md/*'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/crop.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['index.html', 'assets/*'],
      matches: ['<all_urls>'],
    },
  ],
});
