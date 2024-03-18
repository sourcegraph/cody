import { defineConfig } from '@playwright/test'

const isWin = process.platform.startsWith('win')

export default defineConfig({
    workers: 1,
    // Give failing tests more chances
    retries: isWin ? 4 : 2,
    testDir: 'test/e2e',
    timeout: isWin ? 30000 : 20000,
    expect: {
        timeout: isWin ? 5000 : 6000,
    },
})
