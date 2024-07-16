import type { CodyCommand } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import { CommandsView } from './Commands'

const meta: Meta<typeof CommandsView> = {
    title: 'cody/CommandsView',
    component: CommandsView,
    decorators: [VSCodeStandaloneComponent],
    render: args => (
        <div style={{ position: 'relative', padding: '1rem' }}>
            <CommandsView {...args} />
        </div>
    ),
}

export default meta

type Story = StoryObj<typeof CommandsView>

export const DefaultOnly: Story = {
    args: {
        commands: [
            {
                key: 'explain',
                prompt: 'Explain this code',
                description: 'Explain Code',
                type: 'default',
            },
            {
                key: 'test',
                prompt: 'Write a test for this code',
                description: 'Write Test',
                type: 'default',
            },
        ] as CodyCommand[],
    },
}

export const CustomOnly: Story = {
    args: {
        commands: [
            { key: 'custom1', prompt: 'Custom command 1', description: 'Custom 1', type: 'user' },
            { key: 'custom2', prompt: 'Custom command 2', description: 'Custom 2', type: 'workspace' },
        ] as CodyCommand[],
    },
}

export const Mixed: Story = {
    args: {
        commands: [
            {
                key: 'explain',
                prompt: 'Explain this code',
                description: 'Explain Code',
                type: 'default',
            },
            { key: 'custom1', prompt: 'Custom command 1', description: 'Custom 1', type: 'user' },
            {
                key: 'test',
                prompt: 'Write a test for this code',
                description: 'Write Test',
                type: 'default',
            },
            { key: 'custom2', prompt: 'Custom command 2', description: 'Custom 2', type: 'user' },
        ] as CodyCommand[],
    },
}
