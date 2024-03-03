import type { Meta, StoryObj } from '@storybook/react'
import { Chat } from './Chat'
import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'

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

    decorators: [
        story => <div style={{ background: 'var(--vscode-editor-background)' }}>{story()}</div>,
        VSCodeStoryDecorator,
    ],

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
} as Meta

export default meta

export const Default: StoryObj<typeof meta> = {}
