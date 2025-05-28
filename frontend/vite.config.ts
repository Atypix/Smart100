// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': { // Proxy requests from /api on frontend to backend
        target: 'http://localhost:3000', // Backend runs on port 3000
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, '') // Assuming backend routes are NOT prefixed with /api themselves
                                                        // If backend routes ARE /api/something, then this rewrite is not needed.
                                                        // Based on src/index.ts, dataRoutes are mounted on /api, so rewrite is NOT needed.
      }
    }
  }
});
