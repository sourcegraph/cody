/* eslint-disable @typescript-eslint/no-floating-promises */
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
        // Never got it working correctly and sourcemaps increase the size of the binary.
        sourcemap: false,
        logLevel: 'error',
        alias: {
            vscode: path.resolve(process.cwd(), 'src', 'vscode-shim.ts'),
        },
    }
    const res = await build(esbuildOptions)
})()
