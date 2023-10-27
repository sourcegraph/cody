import { defineConfig } from '@playwright/test'

export default defineConfig({
    workers: 1,
    // Give failing tests a second chance
    retries: 2,
    testDir: 'test/e2e',
    use: {
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
    },
})
