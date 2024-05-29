import type { Preview } from '@storybook/react'
import '../webviews/components/shadcn/shadcn.css'
import '../webviews/utils/highlight.css'
// biome-ignore lint/correctness/noUnusedImports: needed because UMD import
import React from 'react'
import { HeadProvider, Link } from 'react-head'

const preview: Preview = {
    parameters: {
        viewport: {
            viewports: [
                {
                    name: 'VSCode Normal Sidebar',
                    styles: { width: '400px', height: '800px' },
                    type: 'desktop',
                },
                {
                    name: 'VSCode Wide Sidebar',
                    styles: { width: '700px', height: '800px' },
                    type: 'desktop',
                },
                {
                    name: 'VSCode Tall Sidebar',
                    styles: { width: '500px', height: '1200px' },
                    type: 'desktop',
                },
            ],
        },
    },
    globalTypes: {
        experimentalContextProviders: {
            // The story must use the ContextProvidersDecorator decorator for this to take effect.
            description: 'Which context providers to enable',
            type: 'boolean',
            defaultValue: false,
            toolbar: {
                title: 'Providers',
                items: [
                    { value: false, title: 'Standard' },
                    { value: true, title: 'Include experimental' },
                ],
            },
        },
        theme: {
            description: 'VS Code theme',
            defaultValue: 'dark-modern',
            toolbar: {
                title: 'VS Code Theme',
                icon: 'photo',
                items: [
                    // todo(tim): We bundle these themes are "core" themes, but it would be nice
                    // to support any theme via
                    // https://main.vscode-cdn.net/stable/dc96b837cf6bb4af9cd736aa3af08cf8279f7685/extensions/theme-defaults/themes/dark_vs.json
                    // etc (see devtools network tab in https://vscode.dev/)
                    { value: 'dark-plus', title: 'Dark+ Theme' },
                    { value: 'dark-modern', title: 'Dark Modern Theme' },
                    { value: 'dark-high-contrast', title: 'Dark High Contrast Theme' },
                    { value: 'light-plus', title: 'Light+ Theme' },
                    { value: 'light-modern', title: 'Light Modern Theme' },
                    { value: 'light-high-contrast', title: 'Light High Contrast Theme' },
                    { value: 'red', title: 'Red Theme' },
                ],
                dynamicTitle: true,
            },
        },
    },
    decorators: [
        (Story, context) => {
            const theme = context.globals.theme
            return (
                <HeadProvider>
                    <Link rel="stylesheet" href={`/vscode-themes/${theme}.css`} />
                    <Story />
                </HeadProvider>
            )
        },
    ],
}

export default preview
