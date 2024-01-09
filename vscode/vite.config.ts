/// <reference types="vitest" />

import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
    resolve: {
        alias:
            mode === 'development'
                ? [
                      // In dev mode, build from TypeScript sources so we don't need to run `tsc -b`
                      // in the background.
                      {
                          find: /^(@sourcegraph\/[\w-]+)$/,
                          replacement: '$1/src/index',
                      },
                  ]
                : [],
    },
    css: { modules: { localsConvention: 'camelCaseOnly' } },
    test: {
        include: ['src/**/*.test.ts?(x)'],
        setupFiles: ['src/testutils/vscode.ts'],
    },
}))
