import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@logicforge/shared-types'],
  },
  build: {
    commonjsOptions: {
      include: [/shared-types/, /node_modules/],
    },
  },
  server: {
    port: 5173,
    proxy:
      process.env.VITE_DISABLE_API_PROXY === 'true'
        ? undefined
        : {
            '/api': {
              target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
              changeOrigin: true,
            },
          },
  },
});
