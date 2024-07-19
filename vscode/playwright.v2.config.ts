import { homedir } from 'node:os'
import { type ReporterDescription, defineConfig } from '@playwright/test'
import { ulid } from 'ulidx'
import type { SymlinkExtensions } from './e2e/utils/symlink-extensions.setup'
import type { TmpDirOptions } from './e2e/utils/tmpdir.setup'
import type { TestOptions, WorkerOptions } from './e2e/utils/vscody'

const isWin = process.platform.startsWith('win')
const isCI = !!process.env.CI
process.env.RUN_ID = process.env.RUN_ID || ulid()

export default defineConfig<WorkerOptions & TestOptions & TmpDirOptions & SymlinkExtensions>({
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
        browserName: 'chromium',
        repoRootDir: '../', //deprecated
        vscodeExtensions: ['sourcegraph.cody-ai'],
        symlinkExtensions: ['.'],
        globalTmpDir: `../.test/runs/${process.env.RUN_ID}/`,
        setupClearGlobalTmpParentDir: true,
        vscodeVersion: 'stable',
        vscodeTmpDir: '../.test/global/vscode',
        vscodeExtensionCacheDir: `${homedir()}/.vscode-server/extensions`,
        vscodeServerTmpDir: '../.test/global/vscode-server',
        binaryTmpDir: '../.test/global/bin',
        waitForExtensionHostDebugger: false,
        recordIfMissing:
            typeof process.env.CODY_RECORD_IF_MISSING === 'string'
                ? process.env.CODY_RECORD_IF_MISSING === 'true'
                : false,
        recordingMode: (process.env.CODY_RECORDING_MODE as any) ?? 'replay',
        recordingDir: '../recordings/vscode/',
        keepUnusedRecordings: false,
        bypassCSP: true,
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        permissions: ['clipboard-read', 'clipboard-write'],
        geolocation: { longitude: -122.40825783227943, latitude: 37.78124453182266 },
        acceptDownloads: false,
        keepRuntimeDirs: 'all',
        allowGlobalVSCodeModification: isCI,
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
            name: 'tmpdir',
            testDir: './e2e/utils',
            testMatch: ['tmpdir.setup.ts'],
            use: {
                clearGlobalTmpDirParent: true,
            },
        },
        {
            name: 'symlink-extensions',
            testDir: './e2e/utils',
            testMatch: ['symlink-extensions.setup.ts'],
        },
        {
            name: 'utils',
            testDir: './e2e/utils',
            testMatch: ['**/*.test.ts'],
            dependencies: ['tmpdir', 'symlink-extensions'],
        },
        {
            name: 'e2e',
            testDir: './e2e',
            testMatch: ['**/*.test.ts'],
            testIgnore: ['issues/**/*', 'utils/**/*'],
            dependencies: ['tmpdir', 'symlink-extensions'],
            use: {
                // recordIfMissing: true, //uncomment for quick manual override
            },
        },
        {
            name: 'issues',
            testDir: './e2e/issues',
            retries: 0,
            testMatch: ['**/*.test.ts'],
            dependencies: ['tmpdir', 'symlink-extensions'],
            use: {
                // recordIfMissing: true, //uncomment for quick manual override
            },
        },
    ],
    reporter: [
        ['line', { printSteps: true, includeProjectInTestName: true }],
        ['html', { outputFolder: '.test-reports', fileName: 'report.html', open: 'never' }],
        ['json', { outputFile: '.test-reports/report.json', open: 'never' }],
        ...(isCI
            ? [
                  ['github', {}] satisfies ReporterDescription,
                  ['buildkite-test-collector/playwright/reporter'] satisfies ReporterDescription,
              ]
            : []),
    ],
})
