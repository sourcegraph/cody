import { ProcessType } from '@sourcegraph/cody-shared'
import { errorToChatError } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'
import { AgenticContextCell } from './AgenticContextCell'

const meta: Meta<typeof AgenticContextCell> = {
    title: 'agentic/AgenticContextCell',
    component: AgenticContextCell,
    decorators: [VSCodeWebview],
}

export default meta

type Story = StoryObj<typeof AgenticContextCell>

export const Default: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'review-agent',
                state: 'success',
                content: 'reviewing...',
            },
            {
                id: 'Code Search',
                state: 'success',
                content: 'Found relevant code in repository',
                type: ProcessType.Tool,
            },
            {
                id: 'GitHub',
                state: 'success',
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
                state: 'pending',
                content: 'Searching codebase...',
                type: ProcessType.Tool,
            },
            {
                id: 'Documentation',
                state: 'pending',
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
                state: 'success',
                content: 'Search completed',
                type: ProcessType.Tool,
            },
            {
                id: 'API Call',
                state: 'error',
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

export const MixedStatuses: Story = {
    args: {
        isContextLoading: true,
        processes: [
            {
                id: 'search-1',
                state: 'pending',
                content: 'Searching for relevant files...',
                type: ProcessType.Tool,
            },
            {
                id: 'review-agent',
                state: 'success',
                content: 'Review completed successfully.',
            },
            {
                id: 'api-call',
                state: 'error',
                content: 'API call failed due to timeout.',
                type: ProcessType.Tool,
            },
            {
                id: 'docs',
                state: 'pending',
                content: 'Scanning documentation...',
                type: ProcessType.Tool,
            },
        ],
    },
}

export const SinglePending: Story = {
    args: {
        isContextLoading: true,
        processes: [
            {
                id: 'pending-action',
                state: 'pending',
                content: 'Waiting for response from server...',
                type: ProcessType.Tool,
            },
        ],
    },
}

export const SingleError: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'error-action',
                state: 'error',
                content: 'Failed to fetch data: network error.',
                type: ProcessType.Tool,
            },
        ],
    },
}

export const SingleSuccess: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'success-action',
                state: 'success',
                content: 'Action completed successfully.',
                type: ProcessType.Tool,
            },
        ],
    },
}

export const WithErrorProperty: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'error-with-property',
                state: 'pending',
                error: errorToChatError(new Error('Something went wrong')),
                content: 'Processing...',
                type: ProcessType.Tool,
            },
        ],
    },
}

const FIXTURE_CONTEXT_ITEM = {
    type: 'file',
    uri: URI.file('/foo'),
    content: '',
} as const

export const WithItems: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'context-items',
                state: 'success',
                content: 'Selected context',
                items: [FIXTURE_CONTEXT_ITEM, FIXTURE_CONTEXT_ITEM, FIXTURE_CONTEXT_ITEM], // 3 items
                type: ProcessType.Tool,
            },
        ],
    },
}

export const NoContent: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'no-content',
                state: 'success',
                content: '',
                type: ProcessType.Tool,
            },
        ],
    },
}

export const NoTitle: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'no-title',
                state: 'success',
                content: 'No title present',
                type: ProcessType.Tool,
            },
        ],
    },
}

export const DeepCodyProcess: Story = {
    args: {
        isContextLoading: false,
        processes: [
            {
                id: 'deep-cody',
                title: 'Special Deep Cody',
                state: 'success',
                content: 'Deep Cody process running',
                type: ProcessType.Tool,
            },
            {
                id: 'other-tool',
                state: 'pending',
                content: 'Other tool running',
                type: ProcessType.Tool,
            },
        ],
    },
}
