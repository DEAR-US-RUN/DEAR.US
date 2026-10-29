import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.VITE_DEV_PORT || 5173),
    allowedHosts: ['.e2b.app'],
    proxy: { '/api': { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  build: { sourcemap: false },
});
