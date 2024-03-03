import type { Meta, StoryObj } from '@storybook/react'
import { Chat } from './Chat'
import { VSCodeStoryDecorator, WithBorder } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof Chat> = {
    title: 'cody/Chat',
    component: Chat,

    args: {
        transcript: [
            { speaker: 'human', text: 'Hi from human.', displayText: 'Hi from human.' },
            { speaker: 'assistant', displayText: 'Hello from Cody!' },
        ],
        messageInProgress: null,
        inputHistory: [{ inputText: 'My previous message', inputContextFiles: [] }],
        setInputHistory: () => {},
        chatIDHistory: [],
        chatEnabled: true,
        userInfo: { isCodyProUser: true, isDotComUser: true },
        isWebviewActive: true,
        vscodeAPI: {
            postMessage: () => {},
            onMessage: () => () => {},
        },
        telemetryService: null as any,
        isTranscriptError: false,
    } satisfies React.ComponentProps<typeof Chat>,

    decorators: [WithBorder, VSCodeStoryDecorator],
} as Meta

export default meta

export const Default: StoryObj<typeof meta> = {}
