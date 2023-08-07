import path from 'path'

import { aliasPath } from 'esbuild-plugin-alias-path'

/** @type {import('esbuild').BuildOptions} */
export const esbuildOptions = {
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
