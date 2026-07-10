import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Python RDKit backend (server/app.py) listens here. The desktop
// orchestrator (desktop/scripts/dev.mjs) boots it before Vite; in plain
// `npm run dev` you start it yourself (see README). Vite proxies /api → it,
// so the frontend never deals with CORS or a hard-coded host.
const BACKEND_PORT = Number(process.env.CHEMSKETCHER_API_PORT) || 8473;

export default defineConfig({
  plugins: [react()],
  // Unique base port for this app so sibling Electron apps never collide
  // (ChemViewer uses 5373). strictPort is left off so a busy port increments.
  server: {
    port: Number(process.env.CHEMSKETCHER_PORT) || 5473,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
