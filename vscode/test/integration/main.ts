import * as path from 'path'

import { runTests } from '@vscode/test-electron'

import { MockServer } from '../fixtures/mock-server'

async function main(): Promise<void> {
    // Set this environment variable so the extension exposes hooks to the test runner.
    process.env.CODY_TESTING = 'true'

    // When run, this script's filename is `vscode/dist/tsc/test/integration/main.js`, so
    // __dirname is derived from that path, not this file's source path.
    const vscodeCodyRoot = path.resolve(__dirname, '..', '..', '..', '..')

    // The directory containing the extension's package.json, passed to --extensionDevelopmentPath.
    const extensionDevelopmentPath = vscodeCodyRoot

    // The root folder for all integration test workspaces in the src/ dir.
    const testFixturesPath = path.resolve(vscodeCodyRoot, 'test', 'fixtures')

    /// The root folder containing the sets of integration tests to run.
    const integrationTestsPath = path.resolve(vscodeCodyRoot, 'dist', 'tsc', 'test', 'integration')

    // The set of tests and the workspaces they operate on.
    const testConfigs = [
        { testsFolder: 'single-root', workspace: 'workspace' },
        { testsFolder: 'multi-root', workspace: 'multi-root.code-workspace' },
    ]

    try {
        // Download VS Code, unzip it, and run the integration test.
        await MockServer.run(async () => {
            for (const testConfig of testConfigs) {
                await runTests({
                    version: '1.81.1',
                    extensionDevelopmentPath,
                    extensionTestsPath: path.normalize(
                        path.resolve(integrationTestsPath, testConfig.testsFolder, 'index')
                    ),
                    launchArgs: [
                        path.normalize(path.resolve(testFixturesPath, testConfig.workspace)),
                        '--disable-extensions', // disable other extensions
                    ],
                })
            }
        })
    } catch (error) {
        console.error('Failed to run tests:', error)
        process.exit(1)
    }
}
main()
