import type { Meta, StoryObj } from '@storybook/react'

import { AUTH_STATUS_FIXTURE_AUTHED, CLIENT_CAPABILITIES_FIXTURE } from '@sourcegraph/cody-shared'
import { dummyClientConfigForTest } from '@sourcegraph/cody-shared/src/sourcegraph-api/clientConfig'
import { App } from './App'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'
import { View } from './tabs'
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
                experimentalNoodle: false,
                smartApply: false,
                hasEditCapability: false,
                allowEndpointChange: true,
                experimentalPromptEditorEnabled: false,
                experimentalAgenticChatEnabled: false,
                attribution: 'none',
            },
            clientCapabilities: CLIENT_CAPABILITIES_FIXTURE,
            authStatus: {
                ...AUTH_STATUS_FIXTURE_AUTHED,
                displayName: 'Tim Lucas',
                avatarURL: 'https://avatars.githubusercontent.com/u/153?v=4',
                authenticated: true,
                hasVerifiedEmail: true,
                requiresVerifiedEmail: false,
                endpoint: 'https://example.com',
            },
            workspaceFolderUris: [],
        })
        cb({
            type: 'clientConfig',
            clientConfig: dummyClientConfigForTest,
        })
        if (firstTime) {
            cb({ type: 'view', view: View.Chat })
            firstTime = false
        }
        return () => {}
    },
    postMessage: () => {},
    getState: () => ({}),
    setState: () => {},
}

let firstTime = true
