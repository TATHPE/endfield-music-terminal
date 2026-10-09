import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests run on plain Node: they only cover pure logic (lyrics parsing,
// search syntax, formatters, playlist helpers), so no DOM environment is needed.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
