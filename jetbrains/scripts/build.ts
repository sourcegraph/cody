import { existsSync } from 'fs'
import path from 'path'

import * as esbuild from 'esbuild'
import { rm } from 'shelljs'

import { packageResolutionPlugin, stylePlugin, workerPlugin, buildTimerPlugin } from '@sourcegraph/build-config'

const rootPath = path.resolve(__dirname, '../../../')
const jetbrainsWorkspacePath = path.resolve(rootPath, 'client', 'jetbrains')
const webviewSourcePath = path.resolve(jetbrainsWorkspacePath, 'webview', 'src')

// Build artifacts are put directly into the JetBrains resources folder
const distributionPath = path.resolve(jetbrainsWorkspacePath, 'src', 'main', 'resources', 'dist')

export async function build(): Promise<void> {
    if (existsSync(distributionPath)) {
        rm('-rf', distributionPath)
    }

    const ctx = await esbuild.context({
        entryPoints: {
            search: path.resolve(webviewSourcePath, 'search', 'index.tsx'),
            bridgeMock: path.resolve(webviewSourcePath, 'bridge-mock', 'index.ts'),
            style: path.join(webviewSourcePath, 'index.scss'),
        },
        bundle: true,
        format: 'esm',
        platform: 'browser',
        define: {
            'process.env.IS_TEST': 'false',
            global: 'globalThis',
        },
        splitting: true,
        inject: ['./scripts/react-shim.js', './scripts/process-shim.js', './scripts/buffer-shim.js'],
        plugins: [
            stylePlugin,
            workerPlugin,
            packageResolutionPlugin({
                process: require.resolve('process/browser'),
                path: require.resolve('path-browserify'),
                http: require.resolve('stream-http'),
                https: require.resolve('https-browserify'),
                url: require.resolve('url'),
                util: require.resolve('util'),
            }),
            buildTimerPlugin,
        ],
        loader: {
            '.ttf': 'file',
        },
        assetNames: '[name]',
        minify: true,
        sourcemap: true,
        outdir: distributionPath,
    })

    if (process.env.WATCH) {
        await ctx.watch()
    } else {
        await ctx.rebuild()
        await ctx.dispose()
    }
}
