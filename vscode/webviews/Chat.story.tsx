import type { Meta, StoryObj } from '@storybook/react'
import { Chat } from './Chat'
import { VSCodeStoryDecorator, WithBorder } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof Chat> = {
    title: 'cody/Chat',
    component: Chat,

    args: {
        transcript: [
            { speaker: 'human', displayText: 'Hi from human.' },
            { speaker: 'assistant', displayText: 'Hello from Cody!' },
        ],
        messageInProgress: null,
        messageBeingEdited: undefined,
        setMessageBeingEdited: () => {},
        inputHistory: [],
        setInputHistory: () => {},
        chatIDHistory: [],
        onSubmit: () => {},
        isCodyEnabled: true,
        chatEnabled: true,
        userInfo: { isCodyProUser: true, isDotComUser: true },
        isWebviewActive: true,
        vscodeAPI: null as any,
        telemetryService: null as any,
        isTranscriptError: false,
    } as React.ComponentProps<typeof Chat>,

    decorators: [WithBorder, VSCodeStoryDecorator],
} as Meta

export default meta

export const Default: StoryObj<typeof meta> = {}

export const PrefilledPromptEditor: StoryObj<typeof meta> = {
    args: {},
}
