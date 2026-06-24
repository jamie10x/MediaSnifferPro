import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Tests cover the pure, framework-free logic in src/shared (no chrome/DOM APIs).
export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
