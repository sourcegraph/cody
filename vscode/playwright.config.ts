import { defineConfig } from '@playwright/test'

const isWin = process.platform.startsWith('win')

export default defineConfig({
    workers: 1,
    retries: 1, // give flaky tests 1 more chance, but we should fix flakiness when we see it
    testDir: 'test/e2e',
    timeout: isWin ? 30000 : 20000,
    expect: {
        timeout: isWin ? 5000 : 6000,
    },
})
