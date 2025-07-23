import {
    AUTH_STATUS_FIXTURE_AUTHED,
    AUTH_STATUS_FIXTURE_UNAUTHED,
    AvailabilityError,
    CLIENT_CAPABILITIES_FIXTURE,
} from '@sourcegraph/cody-shared'
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
        view: View.Chat,
        setView: () => {},
        configuration: {
            config: {} as any,
            clientCapabilities: CLIENT_CAPABILITIES_FIXTURE,
            authStatus: AUTH_STATUS_FIXTURE_AUTHED,
        },
    },
    decorators: [VSCodeWebview],
}

export default meta

export const NetworkError: StoryObj<typeof meta> = {
    args: {
        configuration: {
            config: {} as any,
            clientCapabilities: CLIENT_CAPABILITIES_FIXTURE,
            authStatus: {
                ...AUTH_STATUS_FIXTURE_UNAUTHED,
                error: new AvailabilityError(),
            },
        },
        instanceNotices: [
            {
                key: '1',
                title: 'Error',
                message: new AvailabilityError().message,
            },
        ],
    },
}
