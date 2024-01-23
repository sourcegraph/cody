import { statSync } from 'fs'
import { resolve } from 'path'

import { defineProjectWithDefaults } from '../.config/viteShared'

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
    } catch {}
    return shimFromAgentDirectory
}

export default defineProjectWithDefaults(__dirname, {
    resolve: {
        alias: { vscode: shimDirectory() },
    },
})
