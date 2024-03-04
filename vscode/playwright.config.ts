import { defineConfig } from '@playwright/test'

export default defineConfig({
    workers: 1,
    // Give failing tests a second chance
    retries: 0, // TODO(sqs): back to 2
    testDir: 'test/e2e',
    expect: {
        timeout: 2000,
    },
})
