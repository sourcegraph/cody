import { statSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineProjectWithDefaults } from '../.config/viteShared'
import { configDefaults } from 'vitest/config'

const shimFromAgentDirectory = resolve(process.cwd(), 'src', 'vscode-shim')
const shimFromRootDirectory = resolve(process.cwd(), 'agent', 'src', 'vscode-shim')

// Returns the absolute path to the vscode-shim.ts file depending on whether
// we're running tests from the root directory of the cody repo or from the
// agent/ subdirectory.
function shimDirectory(): string {
    try {
        if (statSync(shimFromRootDirectory + '.ts').isFile()) {
            return shimFromRootDirectory
        }
    } catch { }
    return shimFromAgentDirectory
}

export default defineProjectWithDefaults(__dirname, {
    resolve: {
        alias: { vscode: shimDirectory() },
    },
    test: {
        exclude: [
            // Needed even though we use mergeConfig in the defineProjectWithDefaults.
            // Without this, it'll crawl node_modules/ and fail with a lot of errors.
            ...configDefaults.exclude,
            // Path is relative to the root, not this folder.
            'src/local-e2e/**',
        ],
    },
})
