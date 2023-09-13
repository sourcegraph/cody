import * as path from 'path'

import { runTests } from '@vscode/test-electron'

import { TEST_WORKSPACE_PATH, VSCODE_CODY_ROOT } from './constants'

async function main(): Promise<void> {
    // The directory containing the extension's package.json, passed to --extensionDevelopmentPath.
    const extensionDevelopmentPath = VSCODE_CODY_ROOT

    // The path to the test runner script, passed to --extensionTestsPath.
    const extensionTestsPath = path.resolve(VSCODE_CODY_ROOT, 'dist', 'tsc', 'test', 'completions-3', 'index')

    try {
        // Download VS Code, unzip it, and run the integration test.
        await runTests({
            version: '1.81.1',
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                TEST_WORKSPACE_PATH,
                '--disable-extensions', // disable other extensions
            ],
        })
    } catch (error) {
        console.error('Failed to run tests:', error)
        process.exit(1)
    }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main()
