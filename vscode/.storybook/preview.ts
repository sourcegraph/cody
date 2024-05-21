import type { Preview } from '@storybook/react'
import '../webviews/components/shadcn/shadcn.css'

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
    },
}

export default preview
