import * as path from 'path'

import { runTests } from '@vscode/test-electron'

import { MockServer } from '../fixtures/mock-server'

async function main(): Promise<void> {
    // Set this environment variable so the extension exposes hooks to the test runner.
    process.env.CODY_TESTING = 'true'

    // No rg is installed on CI, so use `true` (which ignores arguments and always returns empty
    // with exit status 0).
    process.env.MOCK_RG_PATH = 'true'

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

    let exitCode = 0
    try {
        // Download VS Code, unzip it, and run the integration test.
        await MockServer.run(async () => {
            for (const testConfig of testConfigs) {
                try {
                    const testRunExitCode = await runTests({
                        // The VS Code version to use for integration tests (there is also a version in ../e2e/install-deps.ts for e2e tests).
                        //
                        // We set this to stable so that tests are always running on the version of VS Code users are likely to be using. This may
                        // result in tests breaking after a VS Code release but it's better for them to be investigated than potential bugs being
                        // missed because we're running on an older version than users.
                        version: 'stable',
                        extensionDevelopmentPath,
                        extensionTestsPath: path.normalize(
                            path.resolve(integrationTestsPath, testConfig.testsFolder, 'index')
                        ),
                        launchArgs: [
                            path.normalize(path.resolve(testFixturesPath, testConfig.workspace)),
                            '--disable-extensions', // disable other extensions
                        ],
                    })
                    exitCode += testRunExitCode
                } catch (error) {
                    console.error(`Failed to run tests (${testConfig.testsFolder}):`, error)
                    exitCode++
                }
            }
        })
    } catch (error) {
        console.error('Failed to run tests:', error)
        exitCode++
    }
    process.exit(exitCode)
}
main()
