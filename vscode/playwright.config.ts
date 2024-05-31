import { defineConfig } from '@playwright/test'

const isWin = process.platform.startsWith('win')

export default defineConfig({
    workers: 1,
    retries: isWin ? 4 : 1, // give flaky tests more chances, but we should fix flakiness when we see it
    forbidOnly: !!process.env.CI,
    testDir: 'test/e2e',
    timeout: 30000,
    expect: {
        timeout: isWin ? 5000 : 3000,
    },
})
