import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
});
