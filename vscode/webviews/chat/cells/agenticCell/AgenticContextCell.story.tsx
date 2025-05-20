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
                id: 'Terminal',
                state: 'success',
                content: 'Executed git status command',
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
                id: 'Codebase File',
                state: 'pending',
                content: 'Loading file content...',
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
                id: 'Terminal',
                state: 'error',
                content: 'Failed to execute command',
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
                id: 'Code Search',
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
                id: 'Terminal',
                state: 'error',
                content: 'Command execution failed.',
                type: ProcessType.Tool,
            },
            {
                id: 'Cody Memory',
                state: 'pending',
                content: 'Retrieving from memory...',
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
                id: 'Codebase File',
                state: 'pending',
                content: 'Retrieving file content...',
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
                id: 'Terminal',
                state: 'error',
                content: 'Failed to execute command: Permission denied.',
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
                id: 'Code Search',
                state: 'success',
                content: 'Found 3 matching results.',
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
                id: 'Codebase File',
                state: 'pending',
                error: errorToChatError(new Error('File not found')),
                content: 'Loading file...',
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
                id: 'Code Search',
                state: 'success',
                content: 'Found relevant files',
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
                id: 'Cody Memory',
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
                id: 'Terminal',
                state: 'success',
                content: 'Command executed successfully',
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
                id: 'Cody Memory',
                state: 'pending',
                content: 'Retrieving memory data',
                type: ProcessType.Tool,
            },
        ],
    },
}
