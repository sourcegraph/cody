import type { Meta, StoryObj } from '@storybook/react'

import { RateLimitError } from '@sourcegraph/cody-shared'
import { ErrorItem } from './chat/ErrorItem'

import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof ErrorItem> = {
    title: 'cody/Chat Error Item',
    component: ErrorItem,
    decorators: [VSCodeWebview],
    render: args => (
        <div style={{ position: 'relative', padding: '1rem' }}>
            <ErrorItem {...args} />
        </div>
    ),
}

export default meta

type Story = StoryObj<typeof ErrorItem>

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
