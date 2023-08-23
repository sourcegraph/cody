import { ComponentMeta, ComponentStoryObj } from '@storybook/react'

import { NOOP_TELEMETRY_SERVICE } from '@sourcegraph/cody-shared/src/telemetry'

import { AuthStatus, defaultAuthStatus, unauthenticatedStatus } from '../src/chat/protocol'

import { Login } from './Login'
import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'
import { VSCodeWrapper } from './utils/VSCodeApi'

const meta: ComponentMeta<typeof Login> = {
    title: 'cody/Login',
    component: Login,
    decorators: [VSCodeStoryDecorator],
}

const vscodeAPI: VSCodeWrapper = {
    postMessage: () => {},
    onMessage: () => () => {},
    getState: () => ({}),
    setState: () => {},
}

const validAuthStatus: AuthStatus = {
    ...defaultAuthStatus,
    authenticated: true,
    hasVerifiedEmail: true,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: true,
    siteVersion: '5.1.0',
}
const endpoint = 'https://example.com'
const invalidAccessTokenAuthStatus: AuthStatus = { ...unauthenticatedStatus, endpoint }

const requiresVerifiedEmailAuthStatus: AuthStatus = {
    ...defaultAuthStatus,
    authenticated: true,
    requiresVerifiedEmail: true,
    siteHasCodyEnabled: true,
    siteVersion: '5.1.0',
    endpoint,
}

const supportedAppOS = 'darwin'
const supportedAppArch = 'arm64'
const unsupportedAppOS = 'other-os'
const unsupportedAppArch = 'other-arch'

export default meta

export const Simple: ComponentStoryObj<typeof Login> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <Login
                authStatus={validAuthStatus}
                isAppInstalled={false}
                vscodeAPI={vscodeAPI}
                telemetryService={NOOP_TELEMETRY_SERVICE}
                onLoginRedirect={() => {}}
                endpoint={endpoint}
                appOS={supportedAppOS}
                appArch={supportedAppArch}
            />
        </div>
    ),
}

export const InvalidLogin: ComponentStoryObj<typeof Login> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <Login
                authStatus={invalidAccessTokenAuthStatus}
                isAppInstalled={false}
                vscodeAPI={vscodeAPI}
                telemetryService={NOOP_TELEMETRY_SERVICE}
                onLoginRedirect={() => {}}
                endpoint={endpoint}
                appOS={supportedAppOS}
                appArch={supportedAppArch}
            />
        </div>
    ),
}

export const UnverifiedEmailLogin: ComponentStoryObj<typeof Login> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <Login
                authStatus={requiresVerifiedEmailAuthStatus}
                isAppInstalled={false}
                vscodeAPI={vscodeAPI}
                telemetryService={NOOP_TELEMETRY_SERVICE}
                onLoginRedirect={() => {}}
                endpoint={endpoint}
                appOS={supportedAppOS}
                appArch={supportedAppArch}
            />
        </div>
    ),
}

export const LoginWithAppInstalled: ComponentStoryObj<typeof Login> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <Login
                authStatus={validAuthStatus}
                isAppInstalled={true}
                vscodeAPI={vscodeAPI}
                telemetryService={NOOP_TELEMETRY_SERVICE}
                onLoginRedirect={() => {}}
                endpoint={endpoint}
                appOS={supportedAppOS}
                appArch={supportedAppArch}
            />
        </div>
    ),
}

export const UnsupportedAppOS: ComponentStoryObj<typeof Login> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <Login
                authStatus={validAuthStatus}
                isAppInstalled={false}
                vscodeAPI={vscodeAPI}
                telemetryService={NOOP_TELEMETRY_SERVICE}
                onLoginRedirect={() => {}}
                endpoint={endpoint}
                appOS={unsupportedAppOS}
                appArch={unsupportedAppArch}
            />
        </div>
    ),
}
