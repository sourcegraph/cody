/// <reference types="vitest" />

import path from 'path'

import { defineConfig } from 'vite'

export default defineConfig({
    logLevel: 'warn',
    test: {},
    resolve: {
        alias: { vscode: path.resolve(process.cwd(), 'src', 'vscode-shim') },
    },
})
