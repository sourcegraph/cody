import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

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

    // Copy all .wasm files to the dist/ directory
    const distDir = path.join(process.cwd(), '..', 'vscode', 'dist')
    const files = await fs.readdir(distDir)
    const wasmFiles = files.filter(file => file.endsWith('.wasm'))
    for (const file of wasmFiles) {
        const src = path.join(distDir, file)
        const dest = path.join(process.cwd(), 'dist', file)
        await fs.copyFile(src, dest)
    }
})()
