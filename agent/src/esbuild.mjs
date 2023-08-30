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
        plugins: [
            aliasPath({
                // TODO(sqs): can just use esbuild --alias:vscode=src/vscode-shim.ts
                alias: { vscode: path.resolve(process.cwd(), './src/vscode-shim.ts') },
            }),
        ],
    }
    const res = await build(esbuildOptions)
})()
