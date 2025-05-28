// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // Import path module

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': { // Proxy requests from /api on frontend to backend
        target: 'http://localhost:3000', // Backend runs on port 3000
        changeOrigin: true,
      }
    }
  },
  optimizeDeps: {
    exclude: [
      '@mapbox/node-pre-gyp',
      'mock-aws-s3',
      'aws-sdk',
      'nock',
      'aws-crt', // Adding this as it's often a transitive dependency of aws-sdk causing issues
      'better-sqlite3',
      '@tensorflow/tfjs-node',
      'axios', // If used only by backend, otherwise needs careful handling
      'yahoo-finance2',
      'winston'
    ]
  },
  resolve: {
    alias: {
      // Alias problematic modules to a dummy/empty module
      'aws-sdk': path.resolve(__dirname, 'src/utils/empty-module.js'),
      'mock-aws-s3': path.resolve(__dirname, 'src/utils/empty-module.js'),
      'nock': path.resolve(__dirname, 'src/utils/empty-module.js'),
      '@mapbox/node-pre-gyp': path.resolve(__dirname, 'src/utils/empty-module.js'),
      'aws-crt': path.resolve(__dirname, 'src/utils/empty-module.js'),
      'better-sqlite3': path.resolve(__dirname, 'src/utils/empty-module.js'),
      '@tensorflow/tfjs-node': path.resolve(__dirname, 'src/utils/empty-module.js'),
      // axios, yahoo-finance2, winston are trickier if they *could* be used by frontend utility code
      // that is not part of the main app but gets included by tsc.
      // For now, let's assume they are backend only based on errors.
      'axios': path.resolve(__dirname, 'src/utils/empty-module.js'),
      'yahoo-finance2': path.resolve(__dirname, 'src/utils/empty-module.js'),
      'winston': path.resolve(__dirname, 'src/utils/empty-module.js'),
    }
  }
});
