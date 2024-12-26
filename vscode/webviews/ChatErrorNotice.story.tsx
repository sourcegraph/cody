import type { Meta, StoryObj } from '@storybook/react'

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
        userInfo: {
            isDotComUser: true,
            isCodyProUser: false,
        },
        postMessage: () => {},
    },
}

export const ChatRateLimitFree: Story = {
    args: {
        postMessage: () => {},
        userInfo: {
            isDotComUser: true,
            isCodyProUser: false,
        },
    },
}

export const ChatRateLimitPro: Story = {
    args: {
        postMessage: () => {},
        userInfo: {
            isDotComUser: true,
            isCodyProUser: true,
        },
    },
}
