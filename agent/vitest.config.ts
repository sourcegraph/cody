/// <reference types="vitest" />

import { statSync } from 'fs'
import path from 'path'

import { defineConfig } from 'vite'

const shimFromAgentDirectory = path.resolve(process.cwd(), 'src', 'vscode-shim')
const shimFromRootDirectory = path.resolve(process.cwd(), 'agent', 'src', 'vscode-shim')

// Returns the absolute path to the vscode-shim.ts file depending on whether
// we're running tests from the root directory of the cody repo or from the
// agent/ subdirectory.
function shimDirectory(): string {
    try {
        if (statSync(shimFromRootDirectory + '.ts').isFile()) {
            return shimFromRootDirectory
        }
        // eslint-disable-next-line no-empty
    } catch {}
    return shimFromAgentDirectory
}

export default defineConfig({
    logLevel: 'warn',
    resolve: {
        alias: { vscode: shimDirectory() },
    },
})
