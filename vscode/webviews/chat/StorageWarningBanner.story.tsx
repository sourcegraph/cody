import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import { StorageWarningBanner } from './StorageWarningBanner'

const meta: Meta<typeof StorageWarningBanner> = {
    title: 'chat/StorageWarningBanner',
    component: StorageWarningBanner,
    decorators: [VSCodeStandaloneComponent],
    parameters: {
        layout: 'padded',
    },
}

export default meta

type Story = StoryObj<typeof StorageWarningBanner>

export const Default: Story = {
    render: args => (
        <div style={{ maxWidth: '600px' }}>
            <StorageWarningBanner {...args} />
        </div>
    ),
}
