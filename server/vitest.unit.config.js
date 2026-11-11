// Pure maths tests only: no database needed (`npm run test:unit`).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/goldRates.test.js', 'tests/saleCalc.test.js', 'tests/taxUploader.test.js'],
  },
});
