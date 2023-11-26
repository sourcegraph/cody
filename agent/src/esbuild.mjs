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
        sourcemap: true,
        logLevel: 'error',
        alias: {
            vscode: path.resolve(process.cwd(), 'src', 'vscode-shim.ts'),
        },
    }
    const res = await build(esbuildOptions)
})()
