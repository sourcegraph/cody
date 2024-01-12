import { resolve } from 'path'

import react from '@vitejs/plugin-react'

import { defineProjectWithDefaults } from '../../.config/viteShared'

export default defineProjectWithDefaults(__dirname, {
    plugins: [react()],
    root: __dirname,
    base: './',
    build: {
        emptyOutDir: false,
        outDir: __dirname + '/../dist/webviews',
        target: 'esnext',
        assetsDir: '.',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            watch: {
                include: ['**'],
                exclude: [__dirname + '/../node_modules', __dirname + '/../src'],
            },
            input: {
                index: resolve(__dirname, 'index.html'),
                search: resolve(__dirname, 'search.html'),
            },
            output: {
                entryFileNames: '[name].js',
            },
        },
    },
})
