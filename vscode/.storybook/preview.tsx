import type { Preview } from '@storybook/react'
import '../webviews/components/shadcn/shadcn.css'
import '../webviews/utils/highlight.css'
// biome-ignore lint/correctness/noUnusedImports: needed because UMD import
import React from 'react'
import { HeadProvider, Link } from 'react-head'
import { Theme } from '../webviews/storybook/VSCodeStoryDecorator'

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
                    { value: Theme.DarkPlus, title: 'VSCode: Dark+' },
                    { value: Theme.DarkModern, title: 'VSCode: Dark Modern' },
                    { value: Theme.DarkHighContrast, title: 'VSCode: Dark High Contrast' },
                    { value: Theme.DarkAyuMirage, title: 'VSCode: Dark Ayu Mirage' },
                    { value: Theme.DarkGithubDimmed, title: 'VSCode: Dark GitHub Dimmed' },
                    { value: Theme.DarkShadesOfPurple, title: 'VSCode: Dark Shades of Purple' },
                    { value: Theme.LightPlus, title: 'VSCode: Light+' },
                    { value: Theme.LightModern, title: 'VSCode: Light Modern' },
                    { value: Theme.LightHighContrast, title: 'VSCode: Light High Contrast' },
                    { value: Theme.LightMonokaiProLight, title: 'VSCode: Light Monokai Pro' },
                    { value: Theme.LightSolarized, title: 'VSCode: Light Solarized' },
                    { value: Theme.Red, title: 'VSCode: Red' },
                    { value: Theme.JetBrainsDark, title: 'JetBrains: Dark' },
                    { value: Theme.JetBrainsLight, title: 'JetBrains: Light' },
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
