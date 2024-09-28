import {
    AUTH_STATUS_FIXTURE_UNAUTHED,
    CLIENT_CAPABILITIES_FIXTURE,
    type LegacyWebviewConfig,
} from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { CodyPanelWithData } from './CodyPanel'
import { FIXTURE_TRANSCRIPT } from './chat/fixtures'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'
import { View } from './tabs'
import { LegacyWebviewConfigProviderForTestsOnly } from './utils/useLegacyWebviewConfig'

const meta: Meta<typeof CodyPanelWithData> = {
    title: 'cody/CodyPanel',
    component: CodyPanelWithData,
    args: {
        transcript: FIXTURE_TRANSCRIPT.simple2,
        messageInProgress: null,
        vscodeAPI: {
            postMessage: () => {},
            onMessage: () => () => {},
        },
    },
    decorators: [VSCodeWebview],
}

export default meta

export const Default: StoryObj<typeof meta> = {
    render: args => {
        const [view, setView] = useState<View>(View.Chat)
        return <CodyPanelWithData {...args} view={view} setView={setView} />
    },
}

export const NetworkError: StoryObj<typeof meta> = {
    render: args => (
        <LegacyWebviewConfigProviderForTestsOnly
            value={
                {
                    config: {} as any,
                    clientCapabilities: CLIENT_CAPABILITIES_FIXTURE,
                    authStatus: {
                        ...AUTH_STATUS_FIXTURE_UNAUTHED,
                        showNetworkError: true,
                    },
                } satisfies Partial<LegacyWebviewConfig> as LegacyWebviewConfig
            }
        >
            <CodyPanelWithData {...args} />
        </LegacyWebviewConfigProviderForTestsOnly>
    ),
}
