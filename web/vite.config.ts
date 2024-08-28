import { resolve } from 'node:path'
import react from '@vitejs/plugin-react-swc'
import { analyzer } from 'vite-bundle-analyzer'
import svgr from 'vite-plugin-svgr'

// @ts-ignore
import { defineProjectWithDefaults } from '../.config/viteShared'

const fakeProcessEnv: Record<string, string | boolean> = {
    CODY_SHIM_TESTING: false,
    CODY_TESTING: false,
    CODY_PROFILE_TEMP: false,
    CODY_TELEMETRY_EXPORTER: 'graphql',
    NODE_ENV: 'production',
    NODE_DEBUG: false,
    TESTING_DOTCOM_URL: 'https://sourcegraph.com',
    CODY_WEB_DONT_SET_SOME_HEADERS: true,
    LSP_LIGHT_LOGGING_ENABLED: false,
    LSP_LIGHT_CACHE_DISABLED: false,
    language: 'en-US',
}

export default defineProjectWithDefaults(__dirname, {
    base: '/',
    logLevel: 'info',
    worker: { format: 'es' },
    server: { strictPort: true, port: 5777 },
    plugins: [
        // @ts-ignore
        react({ devTarget: 'esnext' }),
        svgr() as any,
        process.env.ANALYZE ? analyzer({ analyzerMode: 'server' }) : undefined,
    ],
    resolve: {
        alias: [
            { find: 'vscode', replacement: resolve(__dirname, '../agent/src/vscode-shim.ts') },
            {
                find: 'node:child_process',
                replacement: resolve(__dirname, 'lib/agent/shims/child_process.ts'),
            },
            {
                find: /^node:fs\/promises$/,
                replacement: resolve(__dirname, 'lib/agent/shims/fs__promises.ts'),
            },
            { find: /^node:fs$/, replacement: resolve(__dirname, 'lib/agent/shims/fs.ts') },
            { find: /^fs-extra$/, replacement: resolve(__dirname, 'lib/agent/shims/fs.ts') },
            { find: /^node:os$/, replacement: resolve(__dirname, 'lib/agent/shims/os.ts') },
            { find: 'env-paths', replacement: resolve(__dirname, 'lib/agent/shims/env-paths.ts') },
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
            { find: /^fs-extra$/, replacement: resolve(__dirname, 'lib/agent/shims/fs-extra.ts') },
            { find: /^open$/, replacement: resolve(__dirname, 'lib/agent/shims/open.ts') },
            {
                find: /^worker_threads$/,
                replacement: resolve(__dirname, 'lib/agent/shims/worker_threads.ts'),
            },

            // Autocomplete isn't used on web. Omitting it cuts the bundle size by ~5 MB.
            {
                find: './completions/create-inline-completion-item-provider',
                replacement: resolve(__dirname, 'lib/agent/shims/inline-completion-item-provider.ts'),
            },

            {
                find: /^cody-ai\/(.*)$/,
                replacement: resolve(__dirname, '../vscode/$1'),
            },
        ],
    },
    define: {
        __dirname: '"/tmp/__dirname"',

        // TODO(sqs): Workaround for
        // https://github.com/vitest-dev/vitest/issues/5541#issuecomment-2093886235; we only want
        // and need to apply the `define`s when building, not when testing. The `define`s leak into
        // the `agent` tests and cause some failures because process.env.CODY_SHIM_TESTING gets
        // `define`d to `false`.
        ...(process.env.VITEST
            ? {}
            : {
                  process: { env: {} },
                  ...Object.fromEntries(
                      Object.entries(fakeProcessEnv).map(([key, value]) => [
                          `process.env.${key}`,
                          JSON.stringify(value),
                      ])
                  ),
              }),
    },
    build: {
        // Turn off minification since it breaks json-rpc in inline web-worker in Safari
        minify: false,
        outDir: 'dist',
        assetsDir: '.',
        reportCompressedSize: true,
        lib: {
            formats: ['es'],
            entry: [resolve(__dirname, 'lib/index.ts'), resolve(__dirname, 'lib/agent/agent.worker.ts')],
        },
        rollupOptions: {
            external: ['react', 'react/jsx-runtime'],
            watch: {
                include: ['demo/**', 'lib/**'],
                exclude: ['node_modules'],
            },
            output: {
                assetFileNames: '[name].[ext]',
                entryFileNames: '[name].js',
            },
        },
    },
})
