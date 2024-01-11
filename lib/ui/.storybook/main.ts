import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig } from 'vite'

const config: StorybookConfig = {
    stories: ['../src/**/*.story.@(js|jsx|ts|tsx)'],
    addons: ['@storybook/addon-links', '@storybook/addon-essentials', '@storybook/addon-interactions'],
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },
    async viteFinal(config) {
        return mergeConfig(config, {
            resolve: {
                alias: [
                    // In dev mode, build from TypeScript sources so we don't need to run `tsc -b`
                    // in the background.
                    {
                        find: /^(@sourcegraph\/[\w-]+)$/,
                        replacement: '$1/src/index',
                    },
                ],
            },
            css: { modules: { localsConvention: 'camelCaseOnly' } },
        })
    },
    docs: {
        autodocs: 'tag',
    },
}
export default config
