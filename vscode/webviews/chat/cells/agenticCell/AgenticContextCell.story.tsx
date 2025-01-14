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
                id: 'Code Search',
                status: 'success',
                content: 'Found relevant code in repository',
                type: ProcessType.Step,
            },
            {
                id: 'GitHub',
                status: 'success',
                content: 'Checked pull requests',
                type: ProcessType.Step,
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
                type: ProcessType.Step,
            },
            {
                id: 'Documentation',
                status: 'pending',
                content: 'Scanning docs...',
                type: ProcessType.Step,
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
                type: ProcessType.Step,
            },
            {
                id: 'API Call',
                status: 'error',
                content: 'Failed to connect',
                type: ProcessType.Step,
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
