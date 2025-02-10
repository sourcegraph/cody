import { resolve } from 'node:path'
import { sveltekit } from '@sveltejs/kit/vite'
import { svelteTesting } from '@testing-library/svelte/vite'
import { defineProjectWithDefaults } from '../.config/viteShared'

const webDirname = resolve(__dirname, '../web')

const fakeProcessEnv: Record<string, string | boolean> = {
    CODY_SHIM_TESTING: false,
    CODY_TESTING: false,
    CODY_PROFILE_TEMP: false,
    CODY_TELEMETRY_EXPORTER: 'graphql',
    NODE_ENV: 'production',
    NODE_DEBUG: false,
    CODY_OVERRIDE_DOTCOM_URL: 'https://sourcegraph.com',
    CODY_WEB_DONT_SET_SOME_HEADERS: true,
    LSP_LIGHT_LOGGING_ENABLED: false,
    LSP_LIGHT_CACHE_DISABLED: false,
    CODY_LOG_WEBVIEW_RPC_MESSAGES: true,
    language: 'en-US',
    CODY_WEB_DEMO: true,
}

export default defineProjectWithDefaults(__dirname, {
    plugins: [sveltekit(), svelteTesting()],
    worker: { format: 'es' },

    // TODO!(sqs): from cody-web
    resolve: {
        alias: [
            { find: 'vscode', replacement: resolve(webDirname, '../agent/src/vscode-shim.ts') },
            {
                find: 'node:child_process',
                replacement: resolve(webDirname, 'lib/agent/shims/child_process.ts'),
            },
            {
                find: /^node:fs\/promises$/,
                replacement: resolve(webDirname, 'lib/agent/shims/fs__promises.ts'),
            },
            { find: /^node:fs$/, replacement: resolve(webDirname, 'lib/agent/shims/fs.ts') },
            { find: /^fs-extra$/, replacement: resolve(webDirname, 'lib/agent/shims/fs.ts') },
            { find: /^node:os$/, replacement: resolve(webDirname, 'lib/agent/shims/os.ts') },
            { find: 'env-paths', replacement: resolve(webDirname, 'lib/agent/shims/env-paths.ts') },
            {
                find: /^(node:)?path$/,
                replacement: resolve(webDirname, 'node_modules/path-browserify'),
            },
            {
                find: /^(node:)?path\/posix$/,
                replacement: resolve(webDirname, 'node_modules/path-browserify'),
            },
            { find: 'node:stream', replacement: resolve(webDirname, 'node_modules/stream-browserify') },
            { find: 'zlib', replacement: resolve(webDirname, 'lib/agent/shims/zlib.ts') },
            { find: 'stream', replacement: resolve(webDirname, 'lib/agent/shims/stream.ts') },
            { find: /^(node:)?events$/, replacement: resolve(webDirname, 'node_modules/events') },
            { find: /^(node:)?util$/, replacement: resolve(webDirname, 'node_modules/util') },
            { find: /^(node:)?buffer$/, replacement: resolve(webDirname, 'node_modules/buffer') },
            { find: /^fs-extra$/, replacement: resolve(webDirname, 'lib/agent/shims/fs-extra.ts') },
            { find: /^open$/, replacement: resolve(webDirname, 'lib/agent/shims/open.ts') },
            {
                find: /^worker_threads$/,
                replacement: resolve(webDirname, 'lib/agent/shims/worker_threads.ts'),
            },

            // Autocomplete isn't used on web. Omitting it cuts the bundle size by ~5 MB.
            {
                find: './completions/create-inline-completion-item-provider',
                replacement: resolve(webDirname, 'lib/agent/shims/inline-completion-item-provider.ts'),
            },

            {
                find: /^cody-ai\/(.*)$/,
                replacement: resolve(webDirname, '../vscode/$1'),
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
    server: {
        port: 5133,
    },
})
