import { resolve } from 'path'

import react from '@vitejs/plugin-react-swc'

import { defineProjectWithDefaults } from '../.config/viteShared'

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
    define: {
        'process.env.NODE_DEBUG': 'false',

        // HACK: Disable telemetry.
        'process.env.CODY_TELEMETRY_EXPORTER': '"testing"',

        // HACK: Disable an irrelevant assertion.
        'process.env.CODY_SUPPRESS_AGENT_AUTOCOMPLETE_WARNING': 'true',

        // For faster full-page reloads during local dev.
        'import.meta.env.CODY_DEV_HARDCODE_SOME_NETWORK_REQUESTS': Boolean(
            process.env.CODY_DEV_HARDCODE_SOME_NETWORK_REQUESTS
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
