/// <reference types="vitest" />

import { defineConfig } from 'vite'

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts?(x)'],
        setupFiles: ['src/testutils/vscode.ts'],
    },
})
