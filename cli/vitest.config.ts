/// <reference types="vitest" />

import path from 'path'

import { defineConfig } from 'vite'

const shimPath = path.resolve(process.cwd(), '..', 'agent', 'src', 'vscode-shim')
export default defineConfig({
    logLevel: 'warn',
    resolve: {
        alias: { vscode: shimPath },
    },
})
