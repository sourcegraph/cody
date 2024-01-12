import { resolve } from 'path'

import react from '@vitejs/plugin-react'

import { defineProjectWithDefaults } from '../.config/viteShared'

export default defineProjectWithDefaults(__dirname, {
    plugins: [react()],
    publicDir: 'resources',
    base: './',
    build: {
        emptyOutDir: false,
        outDir: 'dist',
        rollupOptions: {
            watch: {
                // https://rollupjs.org/configuration-options/#watch
                include: ['src/**'],
                exclude: ['node_modules'],
            },
            input: {
                main: resolve(__dirname, 'index.html'),
            },
            output: {
                entryFileNames: '[name].js',
            },
        },
    },
})
