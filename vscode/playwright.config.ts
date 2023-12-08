import { defineConfig } from '@playwright/test'

export default defineConfig({
    workers: 1,
    // Give failing tests a second chance
    retries: 2,
    testDir: 'test/e2e',
    timeout: 120000,
    expect: {
        timeout: 10000,
    },
    use: {
        // screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 200000,
        navigationTimeout: 600000,
        trace: 'retain-on-failure',
    },
})
