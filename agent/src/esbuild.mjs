/* eslint-disable @typescript-eslint/no-floating-promises */
import path from 'path'
import process from 'process'

import { build } from 'esbuild'
import { aliasPath } from 'esbuild-plugin-alias-path'

;(async () => {
    /** @type {import('esbuild').BuildOptions} */
    const esbuildOptions = {
        entryPoints: ['./src/index.ts'],
        bundle: true,
        outfile: './dist/index.js',
        platform: 'node',
        format: 'cjs',
        plugins: [
            aliasPath({
                alias: { vscode: path.resolve(process.cwd(), './src/vscode-shim.ts') },
            }),
        ],
    }
    const res = await build(esbuildOptions)
})()
