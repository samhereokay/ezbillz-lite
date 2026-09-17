import { defineWorkspace } from 'vitest/config';
import path from 'path';

const sharedResolve = {
  alias: {
    '@': path.resolve(__dirname, './src')
  }
};

export default defineWorkspace([
  {
    test: {
      name: 'integration',
      include: [
        'tests/integration/**/*.test.ts',
        'tests/golden-path-live.test.ts',
        'tests/e2e.test.ts'
      ],
      environment: 'node',
      poolOptions: {
        threads: {
          singleThread: true
        },
        forks: {
          singleFork: true
        }
      }
    },
    resolve: sharedResolve
  },
  {
    test: {
      name: 'unit',
      include: ['tests/**/*.test.ts'],
      exclude: [
        'tests/integration/**/*.test.ts',
        'tests/golden-path-live.test.ts',
        'tests/e2e.test.ts',
        'tests/e2e/**'
      ],
      environment: 'node'
    },
    resolve: sharedResolve
  }
]);
