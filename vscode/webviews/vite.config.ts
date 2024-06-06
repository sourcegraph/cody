import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

import type { PluginOption } from 'vite'
import { defineProjectWithDefaults } from '../../.config/viteShared'

export default defineProjectWithDefaults(__dirname, {
    plugins: [react(), svgr() as PluginOption],
    root: __dirname,
    base: './',
    build: {
        emptyOutDir: false,
        outDir: __dirname + '/../dist/webviews',
        target: 'esnext',
        assetsDir: '.',
        minify: false,
        sourcemap: false,
        reportCompressedSize: false,
        rollupOptions: {
            external: ['node:https'],
            watch: {
                include: ['**'],
                exclude: [__dirname + '/../node_modules', __dirname + '/../src'],
            },
            input: {
                index: resolve(__dirname, 'index.html'),
                minion: resolve(__dirname, 'minion.html'),
            },
            output: {
                entryFileNames: '[name].js',
            },
        },
    },
})
