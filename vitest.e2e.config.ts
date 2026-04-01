import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/e2e/**/*.test.ts'],
    mockReset: true,
    testTimeout: 30_000,
  },
})
