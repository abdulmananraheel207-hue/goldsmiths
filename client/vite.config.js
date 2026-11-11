import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.join(dirname, 'src'),
      // Shared pure maths (single source of truth) lives in the server package.
      '@shared': path.join(dirname, '..', 'server', 'src', 'services'),
      '@appconfig': path.join(dirname, '..', 'app.config.json'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
