import * as path from 'node:path'
import { type ReporterDescription, defineConfig } from '@playwright/test'
import * as dotenv from 'dotenv'
import { ulid } from 'ulidx'
import { CODY_VSCODE_ROOT_DIR } from './e2e/utils/helpers'
import type { TmpDirOptions } from './e2e/utils/tmpdir.setup'
import type { TestOptions, WorkerOptions } from './e2e/utils/vscody'
import { CREDENTIALS_ENVFILE_PATH } from './e2e/utils/vscody/credentials-envfile'

// Using dotenv files makes it work nicely in VSCode without having to restart the editor
// to load new environment variables.
dotenv.config({ path: path.resolve(CODY_VSCODE_ROOT_DIR, '.env') })
dotenv.config({ path: CREDENTIALS_ENVFILE_PATH })

const isWin = process.platform.startsWith('win')
const isCI = !!process.env.CI
process.env.RUN_ID = process.env.RUN_ID || ulid()

const testRootDir = path.resolve(CODY_VSCODE_ROOT_DIR, '..', '.test')

export default defineConfig<WorkerOptions & TestOptions & TmpDirOptions>({
    workers: '50%',
    retries: 0, // NO MORE FLAKE ALLOWED! It's a slippery slope.
    forbidOnly: isCI,
    fullyParallel: true,
    timeout: isWin || isCI ? 30000 : 20000,
    expect: {
        timeout: isWin || isCI ? 20000 : 10000,
    },
    use: {
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: isCI ? 1 : 2, // TODO: Might be nice to detect this automatically
        // You can override options easily per project/worker/test so they are
        // unlikely to need to be modified here. These are just some sane
        // defaults
        browserName: 'chromium',
        repoRootDir: '../', //deprecated
        vscodeExtensions: ['sourcegraph.cody-ai'],
        symlinkExtensions: ['.'],
        globalTmpDir: path.join(testRootDir, 'runs', process.env.RUN_ID),
        vscodeVersion: 'stable',
        vscodeTmpDir: path.join(testRootDir, 'global', 'vscode'),
        vscodeExtensionCacheDir: path.join(testRootDir, 'global', 'vscode-extensions'),
        vscodeServerTmpDir: path.join(testRootDir, 'global', 'vscode-server'),
        binaryTmpDir: path.join(testRootDir, 'global', 'bin'),
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
            name: 'credentials',
            testDir: './e2e/utils',
            testMatch: ['credentials.setup.ts'],
        },
        {
            name: 'utils',
            testDir: './e2e/utils',
            testMatch: ['**/*.test.ts'],
            dependencies: ['tmpdir', ...(isCI ? [] : ['credentials'])],
        },
        {
            name: 'e2e',
            testDir: './e2e',
            testMatch: ['**/*.test.ts'],
            testIgnore: ['issues/**/*', 'utils/**/*'],
            dependencies: ['tmpdir', ...(isCI ? [] : ['credentials'])],
            use: {
                // recordIfMissing: true, //uncomment for quick manual override
            },
        },
        {
            name: 'issues',
            testDir: './e2e/issues',
            retries: 0,
            testMatch: ['**/*.test.ts'],
            dependencies: ['tmpdir', ...(isCI ? [] : ['credentials'])],
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
