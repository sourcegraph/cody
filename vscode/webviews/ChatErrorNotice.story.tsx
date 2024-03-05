import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { RateLimitError } from '@sourcegraph/cody-shared'
import type { ChatButtonProps } from './Chat'
import { ErrorItem } from './chat/ErrorItem'

import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'

import chatStyles from './Chat.module.css'
import transcriptItemStyles from './chat/TranscriptItem.module.css'

const meta: Meta<typeof ErrorItem> = {
    title: 'cody/Chat Error Item',
    component: ErrorItem,
    decorators: [VSCodeStoryDecorator],
    parameters: {
        backgrounds: {
            default: 'vscode',
            values: [
                {
                    name: 'vscode',
                    value: 'var(--vscode-sideBar-background)',
                },
            ],
        },
    },
    render: args => (
        <div
            className={classNames(
                transcriptItemStyles.row,
                chatStyles.transcriptItem,
                transcriptItemStyles.assistantRow
            )}
            style={{ border: '1px solid var(--vscode-sideBarSectionHeader-border)' }}
        >
            <ErrorItem {...args} />
        </div>
    ),
}

export default meta

type Story = StoryObj<typeof ErrorItem>

const ChatButton: React.FunctionComponent<ChatButtonProps> = ({
    label,
    action,
    onClick,
    appearance,
}) => (
    <VSCodeButton
        type="button"
        onClick={() => onClick(action)}
        className={chatStyles.chatButton}
        appearance={appearance}
    >
        {label}
    </VSCodeButton>
)

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
        ChatButtonComponent: ChatButton,
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
        ChatButtonComponent: ChatButton,
    },
}
