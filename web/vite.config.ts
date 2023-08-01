/// <reference types="vitest" />

import { resolve } from 'path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [react()],
    publicDir: 'resources',
    base: './',
    css: {
        modules: {
            localsConvention: 'camelCaseOnly',
        },
    },
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
