import { resolve } from 'node:path'
import type { StorybookConfig } from '@storybook/react-vite'
import { defineProjectWithDefaults } from '../../.config/viteShared'

const config: StorybookConfig = {
    stories: ['../webviews/**/*.story.@(js|jsx|ts|tsx)'],
    addons: [
        {
            name: '@storybook/addon-essentials',
            options: {
                backgrounds: false, // We use our own theme selector
            },
        },
    ],
    previewHead: head => `
    ${head}
    <style>
      @media (prefers-color-scheme: dark) {
          body {
              /* Avoid white flash when changing stories. */
              background-color: var(--vscode-editor-background, #1f1f1f) !important;
          }
      }
    </style>
  `,
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
            resolve: {
                alias: [
                    {
                        find: 'env-paths',
                        replacement: resolve(__dirname, '../../web/lib/agent/shims/env-paths.ts'),
                    },
                ],
            },
        }),
    staticDirs: ['./static'],
}
export default config
