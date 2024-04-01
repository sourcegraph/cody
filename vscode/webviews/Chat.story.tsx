import type { Meta, StoryObj } from '@storybook/react'
import { Chat } from './Chat'
import { FIXTURE_TRANSCRIPT } from './chat/fixtures'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof Chat> = {
    title: 'cody/Chat',
    component: Chat,

    argTypes: {
        transcript: {
            name: 'Transcript fixture',
            options: Object.keys(FIXTURE_TRANSCRIPT),
            mapping: FIXTURE_TRANSCRIPT,
            control: { type: 'select' },
        },
    },
    args: {
        transcript: FIXTURE_TRANSCRIPT.simple2,
        messageInProgress: null,
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
        isNewInstall: false,
    } satisfies React.ComponentProps<typeof Chat>,

    decorators: [VSCodeWebview],
}

export default meta

export const Default: StoryObj<typeof meta> = {}
