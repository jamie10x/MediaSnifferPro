import { defineConfig } from 'vitest/config';

// The native sources use NodeNext-style `.js` import specifiers that actually
// point at `.ts` files. Strip the `.js` so Vitest resolves them to the TS source.
export default defineConfig({
  resolve: {
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' }],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
