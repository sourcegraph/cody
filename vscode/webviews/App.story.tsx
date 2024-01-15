import { type ComponentMeta, type ComponentStoryObj } from '@storybook/react'

import { defaultAuthStatus } from '../src/chat/protocol'

import { App } from './App'
import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'
import { type VSCodeWrapper } from './utils/VSCodeApi'

const meta: ComponentMeta<typeof App> = {
    title: 'cody/App',
    component: App,

    decorators: [VSCodeStoryDecorator],
}

export default meta

export const Simple: ComponentStoryObj<typeof App> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <App vscodeAPI={dummyVSCodeAPI} />
        </div>
    ),
}

const dummyVSCodeAPI: VSCodeWrapper = {
    onMessage: cb => {
        // Send initial message so that the component is fully rendered.
        cb({
            type: 'config',
            config: {
                debugEnable: true,
                serverEndpoint: 'https://example.com',
                os: 'linux',
                arch: 'x64',
                homeDir: '/home/user',
                uiKindIsWeb: false,
                extensionVersion: '0.0.0',
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
        return () => {}
    },
    postMessage: () => {},
    getState: () => ({}),
    setState: () => {},
}
