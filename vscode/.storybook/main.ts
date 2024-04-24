import type { StorybookConfig } from '@storybook/react-vite'
import { defineProjectWithDefaults } from '../../.config/viteShared'

const config: StorybookConfig = {
    stories: ['../webviews/**/*.story.@(js|jsx|ts|tsx)'],
    addons: ['@storybook/addon-essentials'],
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },
    viteFinal: async config =>
        defineProjectWithDefaults(__dirname, {
            ...config,
            define: { 'process.env': '{}' },
            resolve: { alias: { 're2-wasm': __dirname + '/re2-wasm-shim.js' } },
        }),
}
export default config
