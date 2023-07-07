/// <reference types="vitest" />

import { defineConfig } from 'vite'

export default defineConfig({
    logLevel: 'warn',
    test: {
        globals: true,
    },
})
