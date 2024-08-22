import type { Meta, StoryObj } from '@storybook/react'

import { defaultAuthStatus, getDotComDefaultModels } from '@sourcegraph/cody-shared'
import { App } from './App'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'
import type { VSCodeWrapper } from './utils/VSCodeApi'

const meta: Meta<typeof App> = {
    title: 'cody/App',
    component: App,
    decorators: [story => <div style={{ height: '80vh' }}> {story()} </div>, VSCodeWebview],
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
                serverEndpoint: 'https://example.com',
                uiKindIsWeb: false,
                experimentalNoodle: false,
                smartApply: false,
            },
            authStatus: {
                ...defaultAuthStatus,
                displayName: 'Tim Lucas',
                avatarURL: 'https://avatars.githubusercontent.com/u/153?v=4',
                isLoggedIn: true,
                authenticated: true,
                hasVerifiedEmail: true,
                requiresVerifiedEmail: false,
                siteHasCodyEnabled: true,
                siteVersion: '5.1.0',
                endpoint: 'https://example.com',
            },
            configFeatures: { attribution: true, chat: true, serverSentModels: true },
            workspaceFolderUris: [],
        })
        cb({ type: 'chatModels', models: getDotComDefaultModels() })
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
