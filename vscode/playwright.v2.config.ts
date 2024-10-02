import * as path from 'node:path'
import { type ReporterDescription, defineConfig } from '@playwright/test'
import * as dotenv from 'dotenv'
import { ulid } from 'ulidx'
import { CODY_VSCODE_ROOT_DIR } from './e2e/utils/helpers'
import type { TmpDirOptions } from './e2e/utils/tmpdir.setup'
import type { TestOptions, WorkerOptions } from './e2e/utils/vscody'
const isWin = process.platform.startsWith('win')
const isCI = !!process.env.CI
const testRootDir = path.resolve(CODY_VSCODE_ROOT_DIR, '..', '.test')

process.env.RUN_ID = process.env.RUN_ID || ulid()

const paths = [
    path.resolve(CODY_VSCODE_ROOT_DIR, '..', '.env'),
    path.resolve(CODY_VSCODE_ROOT_DIR, '.env'),
]
dotenv.config({ path: paths })

if (process.env.CODY_RECORD_IF_MISSING === 'once') {
    // this will get commented out again in teardown
    process.env.CODY_RECORD_IF_MISSING = 'true'
}

if (process.env.CODY_RECORDING_MODE === 'once') {
    // this will get commented out again in teardown
    process.env.CODY_RECORDING_MODE = 'record'
}

const debugMode =
    process.env.PWDEBUG === '1' || process.env.PWDEBUG === 'console' || process.env.VSCDEBUG === '1'

export default defineConfig<WorkerOptions & TestOptions & TmpDirOptions>({
    workers: '50%',
    retries: 0, // Flake is not allowed!
    forbidOnly: isCI,
    // Important: All tests are parallelized, even within a file. So don't save
    // global state or switch to serial mode for that file if you absolutely
    // must!
    fullyParallel: true,
    // We suspend timeouts when debugging (even from VSCode editor) so that if
    // you hit a breakpoint within the extension it doesn't cause a
    // test-failure.
    timeout: debugMode ? 0 : isWin || isCI ? 30000 : 20000,
    expect: {
        timeout: debugMode ? 0 : isWin || isCI ? 20000 : 10000,
    },
    // You can override options easily per project/worker/test so they are
    // unlikely to need to be modified here. These are just some sane defaults
    use: {
        //#region Recording
        debugMode,
        forbidNonPlayback: isCI,
        recordingExpiryStrategy: isCI ? 'error' : 'record',
        keepFinishedTestRunning: !isCI && debugMode,
        // we have a bi-weekly SourceGraph release so it makes sense to
        // re-record them around that cadence. Eventually we'll move to fully
        // local instance recordings so we're always testing against a specific
        // (or multiple) SG versions.
        recordingExpiresIn: '14 days',
        recordIfMissing:
            typeof process.env.CODY_RECORD_IF_MISSING === 'string'
                ? process.env.CODY_RECORD_IF_MISSING === 'true'
                : false,
        keepUnusedRecordings:
            typeof process.env.CODY_RECORD_KEEP_UNUSED === 'string'
                ? process.env.CODY_RECORD_KEEP_UNUSED === 'true'
                : false,
        recordingMode: (process.env.CODY_RECORDING_MODE as any) || 'replay',
        pollyRecordingDir: './recordings',

        //#region Fixutre
        keepRuntimeDirs: 'all',
        vscodeVersion: 'stable',
        globalTmpDir: path.join(testRootDir, 'runs', process.env.RUN_ID!),
        vscodeServerTmpDir: path.join(testRootDir, 'global/vscode-server'),
        vscodeTmpDir: path.join(testRootDir, 'global/vscode'),
        vscodeExtensionCacheDir: path.join(testRootDir, 'global/vscode-extension'),
        waitForExtensionHostDebugger: false,

        //#testDefaults
        templateWorkspaceDir: './test/fixtures/legacy-polyglot-template',
        symlinkExtensions: ['.'],
        vscodeExtensions: ['sourcegraph.cody-ai'],
        binaryTmpDir: path.join(testRootDir, 'global/bin'),

        //#region Playwright
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: isCI ? 1 : 2, // TODO: Might be nice to detect this automatically
        browserName: 'chromium',
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
            dependencies: ['tmpdir'],
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
        },
        {
            name: 'issues',
            testDir: './e2e/issues',
            retries: 0,
            testMatch: ['**/*.test.ts'],
            dependencies: ['tmpdir', ...(isCI ? [] : ['credentials'])],
            use: {
                recordingExpiresIn: null, // these recordings don't need to expire
            },
        },
    ],
    reporter: [
        ['json', { outputFile: '.test-reports/report.json', open: 'never' }],
        ...(isCI
            ? ([
                  ['github', {}],
                  ['buildkite-test-collector/playwright/reporter'],
              ] satisfies Array<ReporterDescription>)
            : ([
                  debugMode
                      ? ['line', { printSteps: true, includeProjectInTestName: true }]
                      : ['list', { open: 'never' }],
                  [
                      'html',
                      {
                          outputFolder: '.test-reports',
                          fileName: 'report.html',
                          open: 'never',
                      },
                  ],
              ] satisfies Array<ReporterDescription>)),
    ],
    // Disabled until https://github.com/microsoft/playwright/issues/32387 is resolved
    // globalSetup: require.resolve(path.resolve(CODY_VSCODE_ROOT_DIR, './e2e/utils/global.setup')),
    // globalTeardown: require.resolve(path.resolve(CODY_VSCODE_ROOT_DIR, './e2e/utils/global.teardown')),
})
