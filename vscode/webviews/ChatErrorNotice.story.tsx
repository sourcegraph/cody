import type { Meta, StoryObj } from '@storybook/react'

import { RateLimitError, errorToChatError } from '@sourcegraph/cody-shared'
import { ErrorItem } from './chat/ErrorItem'

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

export const ChatRateLimitFree: Story = {
    args: {
        error: new RateLimitError(
            'chat messages and commands',
            'thing',
            true,
            20,
            String(60 * 60 * 24 * 25)
        ), // 25 days
        postMessage: () => {},
        userInfo: {
            isDotComUser: true,
            isCodyProUser: false,
        },
    },
}

export const ChatRateLimitPro: Story = {
    args: {
        error: new RateLimitError(
            'chat messages and commands',
            'thing',
            false,
            500,
            String(60 * 60 * 24 * 5)
        ), // 5 days
        postMessage: () => {},
        userInfo: {
            isDotComUser: true,
            isCodyProUser: true,
        },
    },
}

export const ApiVersionError: Story = {
    args: {
        error: errorToChatError(new Error('Request failed: unable to determine Cody API version')),
        userInfo: {
            isDotComUser: true,
            isCodyProUser: false,
        },
        humanMessage: {
            rerunWithDifferentContext: () => {},
            hasInitialContext: { repositories: false, files: false },
            hasExplicitMentions: false,
            appendAtMention: () => {},
        },
    },
}

export const RateLimitFreeUser: Story = {
    args: {
        error: new RateLimitError(
            'chat messages and commands',
            'Chat',
            true,
            20,
            String(60 * 60 * 24 * 25)
        ), // 25 days
        postMessage: () => {},
        userInfo: {
            isDotComUser: true,
            isCodyProUser: false,
        },
    },
}

export const RateLimitProUser: Story = {
    args: {
        error: new RateLimitError(
            'chat messages and commands',
            'Chat',
            false,
            500,
            String(60 * 60 * 24 * 5)
        ), // 5 days
        postMessage: () => {},
        userInfo: {
            isDotComUser: true,
            isCodyProUser: true,
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
        userInfo: {
            isDotComUser: false,
            isCodyProUser: true,
        },
    },
}
