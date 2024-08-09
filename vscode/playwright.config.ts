import { defineConfig } from '@playwright/test'

const isWin = process.platform.startsWith('win')
const isCI = !!process.env.CI

export default defineConfig({
    workers: 1,
    retries: isWin ? 4 : isCI ? 1 : 0, // give flaky tests more chances, but we should fix flakiness when we see it
    forbidOnly: isCI,
    testDir: 'test/e2e',
    timeout: isWin || isCI ? 30000 : 20000,
    expect: {
        timeout: isWin || isCI ? 5000 : 2000,
    },
    reporter: isCI ? [['github'], ['buildkite-test-collector/playwright/reporter']] : [['list']],
    globalSetup: require.resolve('./test/e2e/utils/setup'),
    globalTeardown: require.resolve('./test/e2e/utils/teardown'),
})
