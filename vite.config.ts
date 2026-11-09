import { readFileSync, writeFileSync } from 'fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifest from './src/manifest';

/**
 * crxjs lists every `?script` file as web-accessible to all sites. The crop
 * overlay is a single self-contained file injected by the extension itself,
 * so no web page ever needs to reach it.
 */
function noWebAccessibleResources(): Plugin {
  return {
    name: 'staticshot:no-web-accessible-resources',
    enforce: 'post',
    writeBundle(options) {
      const file = resolve(options.dir ?? 'dist', 'manifest.json');
      const built = JSON.parse(readFileSync(file, 'utf8'));
      delete built.web_accessible_resources;
      writeFileSync(file, `${JSON.stringify(built, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), noWebAccessibleResources()],
  build: {
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
});
