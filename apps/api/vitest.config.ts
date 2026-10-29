import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/__tests__/setup.ts'],
    // Auth tests share one database; run files one at a time.
    fileParallelism: false,
  },
});
