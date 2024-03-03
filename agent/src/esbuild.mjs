import path from 'path'
import process from 'process'

import { build } from 'esbuild'
;(async () => {
    const minify = process.argv.includes('--minify')

    /** @type {import('esbuild').BuildOptions} */
    const esbuildOptions = {
        entryPoints: ['./src/index.ts'],
        bundle: true,
        outfile: path.join('dist', 'index.js'),
        platform: 'node',
        sourcemap: true,
        logLevel: 'error',
        alias: {
            vscode: path.resolve(process.cwd(), 'src', 'vscode-shim.ts'),

            // Build from TypeScript sources so we don't need to run `tsc -b` in the background
            // during dev.
            '@sourcegraph/cody-shared': '@sourcegraph/cody-shared/src/index',
            '@sourcegraph/cody-shared/src': '@sourcegraph/cody-shared/src',
        },
    }
    const res = await build(esbuildOptions)
})()
