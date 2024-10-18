import {
    AUTH_STATUS_FIXTURE_UNAUTHED,
    CLIENT_CAPABILITIES_FIXTURE,
    type LegacyWebviewConfig,
} from '@sourcegraph/cody-shared'
import { ExtensionAPIProviderForTestsOnly, MOCK_API } from '@sourcegraph/prompt-editor'
import type { Meta, StoryObj } from '@storybook/react'
import { Observable } from 'observable-fns'
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
    },
    decorators: [VSCodeWebview],
}

export default meta

export const NetworkError: StoryObj<typeof meta> = {
    render: args => (
        <ExtensionAPIProviderForTestsOnly
            value={{
                ...MOCK_API,
                legacyConfig: () =>
                    Observable.of({
                        config: {} as any,
                        clientCapabilities: CLIENT_CAPABILITIES_FIXTURE,
                        authStatus: {
                            ...AUTH_STATUS_FIXTURE_UNAUTHED,
                            showNetworkError: true,
                        },
                    } satisfies Partial<LegacyWebviewConfig> as LegacyWebviewConfig),
            }}
        >
            <CodyPanel {...args} />
        </ExtensionAPIProviderForTestsOnly>
    ),
}
