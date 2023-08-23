/* eslint-disable @typescript-eslint/no-floating-promises */
import path from 'path'
import process from 'process'

import { build } from 'esbuild'
import { aliasPath } from 'esbuild-plugin-alias-path'

;(async () => {
    const minify = process.argv.includes('--minify')

    /** @type {import('esbuild').BuildOptions} */
    const esbuildOptions = {
        entryPoints: ['./src/index.ts'],
        bundle: true,
        minify,
        outfile: './dist/index.js',
        platform: 'node',
        format: 'cjs',
        sourcemap: 'inline',
        keepNames: true,
        plugins: [
            aliasPath({
                alias: { vscode: path.resolve(process.cwd(), './src/vscode-shim.ts') },
            }),
        ],
    }
    const res = await build(esbuildOptions)
})()
