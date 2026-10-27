import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      { test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
      {
        test: {
          name: 'properties',
          environment: 'node',
          include: ['tests/properties/**/*.test.ts'],
        },
      },
    ],
  },
});
