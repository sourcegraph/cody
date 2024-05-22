import type { Meta, StoryObj } from '@storybook/react'
import { Chat, TokenIndicators } from './Chat'
import { FIXTURE_TRANSCRIPT, FIXTURE_USER_ACCOUNT_INFO } from './chat/fixtures'
import { ContextProvidersDecorator, VSCodeWebview } from './storybook/VSCodeStoryDecorator'

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
        chatEnabled: true,
        userInfo: FIXTURE_USER_ACCOUNT_INFO,
        vscodeAPI: {
            postMessage: () => {},
            onMessage: () => () => {},
        },
        telemetryService: null as any,
        telemetryRecorder: null as any,
        isTranscriptError: false,
        userContextFromSelection: [],
    } satisfies React.ComponentProps<typeof Chat>,

    decorators: [VSCodeWebview, ContextProvidersDecorator],
}

export default meta

export const Default: StoryObj<typeof meta> = {}

export const Disabled: StoryObj<typeof meta> = { args: { chatEnabled: false } }

export const TokenIndi: StoryObj<typeof meta> = {
    render: args => (
        <>
            <Chat {...args} />
            <TokenIndicators
                remainingTokens={{
                    chat: 10000,
                    user: 20000,
                    enhanced: 5000,
                }}
            />
        </>
    ),
}
