import { defaultAuthStatus } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { CodyPanel } from './CodyPanel'
import { FIXTURE_TRANSCRIPT } from './chat/fixtures'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'
import { View } from './tabs'

const meta: Meta<typeof CodyPanel> = {
    title: 'cody/CodyPanel',
    component: CodyPanel,
    args: {
        transcript: FIXTURE_TRANSCRIPT.simple2,
        messageInProgress: null,
        chatEnabled: true,
        vscodeAPI: {
            postMessage: () => {},
            onMessage: () => () => {},
        },
        isTranscriptError: false,
        view: View.Chat,
        setView: () => {},
        configuration: {
            config: {} as any,
            authStatus: defaultAuthStatus,
        },
    },
    decorators: [VSCodeWebview],
}

export default meta

export const NetworkError: StoryObj<typeof meta> = {
    args: {
        configuration: {
            config: {} as any,
            authStatus: {
                ...defaultAuthStatus,
                showNetworkError: true,
            },
        },
    },
}
