/// <reference types="vitest" />

import { defineConfig } from 'vite'

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts?(x)'],
        setupFiles: ['src/testutils/vscode.ts'],
        reporters: [
            // fixme(toolmantim): Remove this when flakiness is gone
            //
            // Enable the hanging-process reporter to try to spot why sometimes unit tests are timing out on exit:
            //   close timed out after 10000ms
            //   Failed to terminate worker while running /home/runner/work/cody/cody/lib/shared/src/common/markdown/markdown.test.ts.
            //   Tests closed successfully but something prevents Vite server from exiting
            //   You can try to identify the cause by enabling "hanging-process" reporter. See https://vitest.dev/config/#reporters
            //
            // https://vitest.dev/guide/reporters.html#hanging-process-reporter
            'hanging-process',
            'default',
        ],
    },
})
