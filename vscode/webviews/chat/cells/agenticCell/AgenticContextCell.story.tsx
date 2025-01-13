import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../../storybook/VSCodeStoryDecorator'
import { AgenticChatCell } from './AgenticContextCell'

const meta: Meta<typeof AgenticChatCell> = {
    title: 'cody/AgenticChatCell',
    component: AgenticChatCell,
    decorators: [VSCodeStandaloneComponent],
}

export default meta

type Story = StoryObj<typeof AgenticChatCell>

export const Default: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'Code Search',
                status: 'success',
                content: 'Found relevant code in repository',
            },
            {
                id: 'Linear',
                status: 'pending',
                content: 'github',
            },
            {
                id: 'Terminal',
                status: 'error',
                content: 'git clone',
            },
        ],
    },
}

export const Loading: Story = {
    args: {
        isContextLoading: true,
        processes: [
            {
                id: 'Code Search',
                status: 'success',
                content: 'function processer',
            },
            {
                id: 'Terminal',
                status: 'success',
                content: 'git diff',
            },
            {
                id: 'Terminal',
                status: 'pending',
                content: 'git clone',
            },
        ],
    },
}

export const WithErrors: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'Code Search',
                status: 'success',
                content: 'Search completed',
            },
            {
                id: 'API Call',
                status: 'error',
                content: 'Failed to connect',
            },
        ],
    },
}

export const Empty: Story = {
    args: {
        isContextLoading: false,
        processes: [],
    },
}
