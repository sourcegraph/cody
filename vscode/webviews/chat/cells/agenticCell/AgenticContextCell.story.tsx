import { ProcessType } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../../storybook/VSCodeStoryDecorator'
import { AgenticContextCell } from './AgenticContextCell'

const meta: Meta<typeof AgenticContextCell> = {
    title: 'cody/AgenticContextCell',
    component: AgenticContextCell,
    decorators: [VSCodeStandaloneComponent],
}

export default meta

type Story = StoryObj<typeof AgenticContextCell>

export const Default: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'review-agent',
                status: 'success',
                content: 'reviewing...',
            },
            {
                id: 'Code Search',
                status: 'success',
                content: 'Found relevant code in repository',
                type: ProcessType.Tool,
            },
            {
                id: 'GitHub',
                status: 'success',
                content: 'Checked pull requests',
                type: ProcessType.Tool,
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
                status: 'pending',
                content: 'Searching codebase...',
                type: ProcessType.Tool,
            },
            {
                id: 'Documentation',
                status: 'pending',
                content: 'Scanning docs...',
                type: ProcessType.Tool,
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
                type: ProcessType.Tool,
            },
            {
                id: 'API Call',
                status: 'error',
                content: 'Failed to connect',
                type: ProcessType.Tool,
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
