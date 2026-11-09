import { defineManifest } from '@crxjs/vite-plugin';

// MV3 manifest for StaticShot. Nothing runs on a page until the toolbar icon or the
// shortcut is used: the crop overlay is injected on that click (see background.ts),
// so the extension asks for no access to the sites you visit.
export default defineManifest({
  manifest_version: 3,
  name: 'StaticShot - Screenshot, Annotate & Share',
  short_name: 'StaticShot',
  description:
    'Capture any page, mark it up and share a link in seconds. Save as an image or a markdown note. No sign-up.',
  version: '2.1.0',
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
  commands: {
    _execute_action: {
      suggested_key: { default: 'Alt+Shift+S' },
      description: 'Capture the page',
    },
  },
});
