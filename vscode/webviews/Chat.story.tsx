import type { Meta, StoryObj } from '@storybook/react'
import { Chat } from './Chat'
import { FIXTURE_TRANSCRIPT } from './chat/fixtures'
import { VSCodeStoryDecorator, WithBorder } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof Chat> = {
    title: 'cody/Chat',
    component: Chat,

    args: {
        transcript: FIXTURE_TRANSCRIPT.simple2,
        messageInProgress: null,
        inputHistory: FIXTURE_TRANSCRIPT.simple2
            .filter(m => m.speaker === 'human')
            .map(m => ({ inputText: m.text ?? '', inputContextFiles: m.contextFiles ?? [] })),
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
