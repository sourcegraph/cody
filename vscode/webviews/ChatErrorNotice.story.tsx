import type { Meta, StoryObj } from '@storybook/react'

import { RateLimitError, errorToChatError } from '@sourcegraph/cody-shared'
import { ErrorItem, type RequestErrorItem } from './chat/ErrorItem'

import { VSCodeStandaloneComponent } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof ErrorItem> = {
    title: 'cody/Chat Error Item',
    component: ErrorItem,
    decorators: [VSCodeStandaloneComponent],
    render: args => (
        <div style={{ position: 'relative', padding: '1rem' }}>
            <ErrorItem {...args} />
        </div>
    ),
}

export default meta

type Story = StoryObj<typeof ErrorItem>

export const GenericError: Story = {
    args: {
        error: errorToChatError(new Error('some error')),
        postMessage: () => {},
    },
}

export const ApiVersionError: Story = {
    args: {
        error: errorToChatError(new Error('Request failed: unable to determine Cody API version')),

        humanMessage: {
            rerunWithDifferentContext: () => {},
            hasInitialContext: { repositories: false, files: false },
            hasExplicitMentions: false,
            appendAtMention: () => {},
        },
    },
}

export const RateLimitEnterpriseUser: Story = {
    args: {
        error: new RateLimitError(
            'chat messages and commands',
            'Chat',
            false,
            1000,
            String(60 * 60 * 24 * 2)
        ), // 2 days
        postMessage: () => {},
    },
}

// Test cases for RequestErrorItem component

type RequestErrorStory = StoryObj<typeof RequestErrorItem>

export const StringError: RequestErrorStory = {
    args: {
        error: 'This is a string error message',
    },
}

export const ErrorWithoutMessage: RequestErrorStory = {
    args: {
        error: {} as Error, // Error object without message property
    },
}

export const ErrorWithUndefinedMessage: RequestErrorStory = {
    args: {
        error: { message: undefined } as any, // Error with undefined message
    },
}
