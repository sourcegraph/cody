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
            css: {
                postcss: __dirname + '/../webviews',
            },
        }),
}
export default config
