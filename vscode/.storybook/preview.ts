// Replace your-framework with the framework you are using (e.g., react, vue3)
import type { Preview } from '@storybook/react'

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
}

export default preview
