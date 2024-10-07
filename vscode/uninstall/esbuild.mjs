// @ts-ignore this is not compiled by typescript so it can import files from outside the rootDir
import { detectForbiddenImportPlugin } from '../../lib/shared/esbuild.utils.mjs'

import { build as esbuild } from 'esbuild'

async function build() {
    const plugins = [detectForbiddenImportPlugin(['vscode'])]
    /** @type {import('esbuild').BuildOptions} */
    const esbuildOptions = {
        entryPoints: ['./uninstall/post-uninstall.ts'],
        bundle: true,
        platform: 'node',
        sourcemap: true,
        logLevel: 'silent',
        write: true,
        outfile: './dist/post-uninstall.js',
        plugins,
        external: ['typescript'],
        format: 'cjs',
        alias: {
            // Build from TypeScript sources so we don't need to run `tsc -b` in the background
            // during dev.
            '@sourcegraph/cody-shared': '@sourcegraph/cody-shared/src/index',
            '@sourcegraph/cody-shared/src': '@sourcegraph/cody-shared/src',
            lexical: './build/lexical-package-fix',
        },
    }

    return esbuild(esbuildOptions)
}

build()
    .then(() => {
        console.log('Post-uninstall script built successfully.')
    })
    .catch(err => {
        console.error('Could not build the post-uninstall script.', err.message)
        process.exit(1)
    })
