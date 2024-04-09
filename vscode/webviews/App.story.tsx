import type { Meta, StoryObj } from '@storybook/react'

import { defaultAuthStatus } from '../src/chat/protocol'

import { DEFAULT_DOT_COM_MODELS } from '@sourcegraph/cody-shared'
import { App } from './App'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'
import type { VSCodeWrapper } from './utils/VSCodeApi'

const meta: Meta<typeof App> = {
    title: 'cody/App',
    component: App,

    decorators: [VSCodeWebview],
}

export default meta

export const Simple: StoryObj<typeof meta> = {
    render: () => <App vscodeAPI={dummyVSCodeAPI} />,
}

const dummyVSCodeAPI: VSCodeWrapper = {
    onMessage: cb => {
        // Send initial message so that the component is fully rendered.
        cb({
            type: 'config',
            config: {
                debugEnable: true,
                serverEndpoint: 'https://example.com',
                uiKindIsWeb: false,
                experimentalGuardrails: false,
            },
            authStatus: {
                ...defaultAuthStatus,
                isLoggedIn: true,
                authenticated: true,
                hasVerifiedEmail: true,
                requiresVerifiedEmail: false,
                siteHasCodyEnabled: true,
                siteVersion: '5.1.0',
                endpoint: 'https://example.com',
            },
            workspaceFolderUris: [],
        })
        cb({ type: 'chatModels', models: DEFAULT_DOT_COM_MODELS })
        cb({
            type: 'history',
            localHistory: {
                chat: {
                    a: {
                        id: 'a',
                        lastInteractionTimestamp: '2024-03-29',
                        interactions: [
                            {
                                humanMessage: { speaker: 'human', text: 'Hello, world!' },
                                assistantMessage: { speaker: 'assistant', text: 'Hi!' },
                            },
                        ],
                    },
                },
            },
        })
        return () => {}
    },
    postMessage: () => {},
    getState: () => ({}),
    setState: () => {},
}
