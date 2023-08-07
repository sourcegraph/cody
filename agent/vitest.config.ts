/// <reference types="vitest" />

import path from 'path'

import { defineConfig } from 'vite'

import { esbuildOptions } from './src/esbuild-options'

export default defineConfig({
    logLevel: 'warn',
    test: {},
    optimizeDeps: { esbuildOptions },
    resolve: {
        alias: { vscode: path.resolve(process.cwd(), 'src', 'vscode-shim') },
    },
})
