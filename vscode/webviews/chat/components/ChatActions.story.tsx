import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStoryDecorator } from '../../storybook/VSCodeStoryDecorator'
import { ChatActions } from './ChatActions'

const meta: Meta<typeof ChatActions> = {
    title: 'ui/ChatActions',
    component: ChatActions,

    args: {
        isWebviewActive: true,
        isEditing: false,
        isMessageInProgress: false,
        isEmptyChat: false,
        onChatResetClick: () => {},
        onCancelEditClick: () => {},
        onEditLastMessageClick: () => {},
        setInputFocus: () => {},
        onRestoreLastChatClick: () => {},
    },

    decorators: [VSCodeStoryDecorator],
} as Meta

export default meta

export const Default: StoryObj<typeof meta> = {
    args: {},
}

export const Inactive: StoryObj<typeof meta> = {
    args: {
        isWebviewActive: false,
    },
}

export const EditingMessage: StoryObj<typeof meta> = {
    args: {
        isEditing: true,
    },
}

export const EmptyChat: StoryObj<typeof meta> = {
    args: {
        isEmptyChat: true,
    },
}

export const MessageInProgress: StoryObj<typeof meta> = {
    args: {
        isMessageInProgress: true,
    },
}
