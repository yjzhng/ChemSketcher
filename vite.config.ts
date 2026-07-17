import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// package.json is the single source of truth for identity + ports
// (OneProduction convention) — never hard-code these.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { appConfig: { devPort: number; apiPort: number } };

const DEV_PORT = Number(process.env.CHEMSKETCHER_PORT) || pkg.appConfig.devPort;
const API_PORT = Number(process.env.CHEMSKETCHER_API_PORT) || pkg.appConfig.apiPort;

export default defineConfig({
  plugins: [react()],
  server: {
    port: DEV_PORT,
    // Pinned, not auto-incrementing: a second concurrent session must fail
    // loudly rather than silently drift onto another port (and risk mixing with
    // a sibling app's session).
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
