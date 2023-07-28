import { resolve } from 'path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [react()],
    css: {
        modules: {
            localsConvention: 'camelCaseOnly',
        },
    },
    root: __dirname,
    base: './',
    build: {
        emptyOutDir: false,
        outDir: __dirname + '/../dist/webviews',
        target: 'esnext',
        assetsDir: '.',
        minify: false,
        sourcemap: 'inline',
        reportCompressedSize: false,
        rollupOptions: {
            watch: {
                include: ['**'],
                exclude: [__dirname + '/../node_modules', __dirname + '/../src'],
            },
            input: {
                index: resolve(__dirname, 'index.html'),
            },
            output: {
                entryFileNames: '[name].js',
            },
        },
    },
})
