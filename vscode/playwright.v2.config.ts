import fs from 'node:fs'
import * as path from 'node:path'
import { type ReporterDescription, defineConfig } from '@playwright/test'
import * as dotenv from 'dotenv'
import { ulid } from 'ulidx'
import { CODY_VSCODE_ROOT_DIR } from './e2e/utils/helpers'
import type { TmpDirOptions } from './e2e/utils/tmpdir.setup'
import type { TestOptions, WorkerOptions } from './e2e/utils/vscody'

prepareEnv()

const isWin = process.platform.startsWith('win')
const isCI = !!process.env.CI
const testRootDir = path.resolve(CODY_VSCODE_ROOT_DIR, '..', '.test')

export default defineConfig<WorkerOptions & TestOptions & TmpDirOptions>({
    workers: '50%',
    retries: 0, // Flake is not allowed!
    forbidOnly: isCI,
    // Important: All tests are parallelized, even within a file. So don't save
    // global state or switch to serial mode for that file if you absolutely
    // must!
    fullyParallel: true,
    timeout: isWin || isCI ? 30000 : 20000,
    expect: {
        timeout: isWin || isCI ? 20000 : 10000,
    },
    // You can override options easily per project/worker/test so they are
    // unlikely to need to be modified here. These are just some sane defaults
    use: {
        //#region Recording
        forbidNonPlayback: isCI,
        recordingExpiryStrategy: isCI ? 'error' : 'record',
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
        // ['line', { printSteps: true, includeProjectInTestName: true }],
        ['list', {}],
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

function prepareEnv() {
    process.env.RUN_ID = process.env.RUN_ID || ulid()

    const paths = [
        path.resolve(CODY_VSCODE_ROOT_DIR, '..', '.env'),
        path.resolve(CODY_VSCODE_ROOT_DIR, '.env'),
    ]
    dotenv.config({ path: paths })

    if (process.env.CODY_RECORD_IF_MISSING === 'once') {
        // we try and unset this value in the file it came from
        const success = commentEnvFileLine(paths, 'CODY_RECORD_IF_MISSING', 'once')
        if (!success) {
            throw new Error('Failed to find .env file that sets CODY_RECORD_IF_MISSING=once')
        }
        console.log('Updated .env file to unset CODY_RECORD_IF_MISSING=once')
        process.env.CODY_RECORD_IF_MISSING = 'true'
    }

    if (process.env.CODY_RECORDING_MODE === 'once') {
        // we try and unset this value in the file it came from
        const success = commentEnvFileLine(paths, 'CODY_RECORDING_MODE', 'once')
        if (!success) {
            throw new Error('Failed to find .env file that sets CODY_RECORDING_MODE=once')
        }
        console.log('Updated .env file to unset CODY_RECORDING_MODE=once')
        process.env.CODY_RECORDING_MODE = 'record'
    }
}

/**
 * This is used to update the .env file that contributes key with a new value for that key
 * @returns true if the value was updated, false if the key was not found in any of the files
 */
function commentEnvFileLine(envFiles: string[], key: string, expectedValue: string): boolean {
    // Array of .env file paths, ordered by priority

    for (const filePath of envFiles) {
        if (fs.existsSync(filePath)) {
            const envConfig = dotenv.parse(fs.readFileSync(filePath))

            if (key in envConfig) {
                // Found the key in this file, update it
                const fileContent = fs.readFileSync(filePath, 'utf8')
                const updatedContent = fileContent.replace(
                    new RegExp(`^(${key}=${expectedValue})`, 'm'),
                    '# $1'
                )

                fs.writeFileSync(filePath, updatedContent)
                return true
            }
        }
    }

    return false
}
