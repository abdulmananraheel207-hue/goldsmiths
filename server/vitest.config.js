import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['./tests/globalSetup.js'],
    env: { NODE_ENV: 'test', LOGIN_RATE_LIMIT: '1000' },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
