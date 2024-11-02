import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import ToolboxTab from './ToolboxTab'
import type { View } from './types'

const meta: Meta<typeof ToolboxTab> = {
    title: 'cody/CodyToolbox',
    component: ToolboxTab,
    decorators: [
        story => (
            <div style={{ position: 'relative', padding: '1rem', maxWidth: '800px' }}>{story()}</div>
        ),
        VSCodeStandaloneComponent,
    ],
    args: {
        setView: (view: View) => {
            console.log('View changed to:', view)
        },
    },
}

export default meta

type Story = StoryObj<typeof ToolboxTab>

export const Default: Story = {
    args: {},
}
