import type { StorybookConfig } from '@storybook/react-vite'
import { defineProjectWithDefaults } from '../../.config/viteShared'

const config: StorybookConfig = {
    stories: ['../webviews/**/*.story.@(js|jsx|ts|tsx)'],
    addons: ['@storybook/addon-links', '@storybook/addon-essentials', '@storybook/addon-interactions'],
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },
    viteFinal: async config =>
        defineProjectWithDefaults(__dirname, { ...config, define: { 'process.env': '{}' } }),
}
export default config
