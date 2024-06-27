import { type ReporterDescription, defineConfig } from '@playwright/test'
import type { SymlinkExtensions } from './e2e/utils/symlink-extensions.setup'
import type { TestOptions, WorkerOptions } from './e2e/utils/vscody'
const isWin = process.platform.startsWith('win')
const isCI = !!process.env.CI

// This makes sure that each run gets a unique run id. This shouldn't really be
// used other than to invalidate lockfiles etc.
process.env.RUN_ID = process.env.RUN_ID || new Date().toISOString()

export default defineConfig<WorkerOptions & TestOptions & SymlinkExtensions>({
    workers: '50%',
    retries: 0, // NO MORE FLAKE ALLOWED! It's a slippery slope.
    forbidOnly: isCI,
    fullyParallel: true,
    timeout: isWin || isCI ? 30000 : 20000,
    expect: {
        timeout: isWin || isCI ? 10000 : 5000,
    },
    use: {
        // You can override options easily per project/worker/test so they are
        // unlikely to need to be modified here. These are just some sane
        // defaults
        repoRootDir: '../', //deprecated
        vscodeExtensions: ['sourcegraph.cody-ai'],
        symlinkExtensions: ['.'],
        vscodeVersion: 'stable',
        vscodeTmpDir: '../.test/global/vscode',
        vscodeExtensionCacheDir: '../.test/global/vscode-extensions',
        binaryTmpDir: '../.test/global/bin',
        recordIfMissing:
            typeof process.env.CODY_RECORD_IF_MISSING === 'string'
                ? process.env.CODY_RECORD_IF_MISSING === 'true'
                : false,
        recordingMode: (process.env.CODY_RECORDING_MODE as any) ?? 'replay',
        recordingDir: '../recordings/vscode/',

        bypassCSP: true,
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        permissions: ['clipboard-read', 'clipboard-write'],
        geolocation: { longitude: -122.40825783227943, latitude: 37.78124453182266 },
        acceptDownloads: false,
        trace: {
            mode: isCI ? 'retain-on-failure' : 'on',
            attachments: true,
            screenshots: true,
            snapshots: true,
            sources: true,
        },
    },
    projects: [
        {
            name: 'symlink-extensions',
            testDir: './e2e/utils',
            testMatch: ['symlink-extensions.setup.ts'],
        },
        {
            name: 'utils',
            testDir: './e2e/utils',
            testMatch: ['**/*.test.ts'],
            dependencies: ['symlink-extensions'],
        },
        {
            name: 'e2e',
            testDir: './e2e',
            testMatch: ['**/*.test.ts'],
            testIgnore: ['issues/**/*', 'utils/**/*'],
            dependencies: ['symlink-extensions'],
        },
        {
            name: 'issues',
            testDir: './e2e/issues',
            retries: 0,
            testMatch: ['**/*.test.ts'],
            dependencies: ['symlink-extensions'],
        },
    ],
    reporter: [
        ['line', { printSteps: true, includeProjectInTestName: true }],
        ['html', { outputFolder: '.test-reports', fileName: 'report.html', open: 'never' }],
        ['json', { outputFile: '.test-reports/report.json', open: 'never' }],
        ...(isCI ? [['github', {}] satisfies ReporterDescription] : []),
    ],
})
