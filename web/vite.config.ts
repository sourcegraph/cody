import { resolve } from 'path'

import react from '@vitejs/plugin-react-swc'

import { defineProjectWithDefaults } from '../.config/viteShared'

const fakeProcessEnv: Record<string, string | boolean> = {
    CODY_SHIM_TESTING: false,
    CODY_TESTING: false,
    CODY_PROFILE_TEMP: false,
    CODY_TELEMETRY_EXPORTER: 'testing',
    NODE_DEBUG: false,
    CODY_SUPPRESS_AGENT_AUTOCOMPLETE_WARNING: true,
    CODY_WEB_DONT_SET_SOME_HEADERS: true,
    language: 'en-US',
}

export default defineProjectWithDefaults(__dirname, {
    plugins: [react({ devTarget: 'esnext' })],
    base: './',
    logLevel: 'info',
    server: {
        strictPort: true,
        port: 5777,
    },
    resolve: {
        alias: [
            { find: 'vscode', replacement: resolve(__dirname, '../agent/src/vscode-shim.ts') },
            {
                find: 'node:child_process',
                replacement: resolve(__dirname, 'src/agent/shims/child_process.ts'),
            },
            {
                find: /^node:fs\/promises$/,
                replacement: resolve(__dirname, 'src/agent/shims/fs__promises.ts'),
            },
            { find: /^node:fs$/, replacement: resolve(__dirname, 'src/agent/shims/fs.ts') },
            { find: /^node:os$/, replacement: resolve(__dirname, 'src/agent/shims/os.ts') },
            { find: 'env-paths', replacement: resolve(__dirname, 'src/agent/shims/env-paths.ts') },
            {
                find: /^(node:)?path$/,
                replacement: resolve(__dirname, 'node_modules/path-browserify'),
            },
            {
                find: /^(node:)?path\/posix$/,
                replacement: resolve(__dirname, 'node_modules/path-browserify'),
            },
            { find: 'node:stream', replacement: resolve(__dirname, 'node_modules/stream-browserify') },
            { find: /^(node:)?events$/, replacement: resolve(__dirname, 'node_modules/events') },
            { find: /^(node:)?util$/, replacement: resolve(__dirname, 'node_modules/util') },
            { find: /^(node:)?buffer$/, replacement: resolve(__dirname, 'node_modules/buffer') },

            // Autocomplete isn't used on web. Omitting it cuts the bundle size by ~5 MB.
            {
                find: './completions/create-inline-completion-item-provider',
                replacement: resolve(__dirname, 'src/agent/shims/inline-completion-item-provider.ts'),
            },
        ],
    },
    // TODO(sqs): Workaround for
    // https://github.com/vitest-dev/vitest/issues/5541#issuecomment-2093886235; we only want and
    // need to apply the `define`s when building, not when testing. The `define`s leak into the
    // `agent` tests and cause some failures because process.env.CODY_SHIM_TESTING gets `define`d to
    // `false`.
    define: process.env.VITEST ? null : {
        ...Object.fromEntries(
            Object.entries(fakeProcessEnv).map(([key, value]) => [
                `process.env.${key}`,
                JSON.stringify(value),
            ])
        ),
    },
    build: {
        emptyOutDir: false,
        outDir: 'dist',
        assetsDir: '.',
        minify: false,
        reportCompressedSize: false,
        rollupOptions: {
            watch: {
                include: ['src/**'],
                exclude: ['node_modules'],
            },
            input: {
                main: resolve(__dirname, 'index.html'),
            },
            output: {
                entryFileNames: '[name].js',
            },
        },
    },
})
