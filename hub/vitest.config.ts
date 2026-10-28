import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      // node:sqlite is stable enough for us but still prints an experimental warning.
      forks: { execArgv: ['--disable-warning=ExperimentalWarning'] },
    },
  },
});
