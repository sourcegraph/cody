import {
    type AuthenticatedAuthStatus,
    type ClientCapabilitiesWithLegacyFields,
    CodyIDE,
} from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import type { ConfigurationSubsetForWebview, LocalEnv } from '../../src/chat/protocol'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import { ConfigProvider } from '../utils/useConfig'
import { AccountTab } from './AccountTab'

const meta: Meta<typeof AccountTab> = {
    title: 'cody/AccountTab',
    component: AccountTab,
    decorators: [
        story => <div style={{ maxWidth: '700px', margin: '2rem' }}>{story()}</div>,
        VSCodeStandaloneComponent,
    ],
    args: {},
}

export default meta

type Story = StoryObj<typeof AccountTab>

const createMockConfig = (overrides = {}) => ({
    config: {
        smartApply: false,
        experimentalNoodle: false,
        serverEndpoint: 'https://sourcegraph.com',
        uiKindIsWeb: false,
    } as ConfigurationSubsetForWebview & LocalEnv,
    clientCapabilities: {
        isVSCode: false,
        agentIDE: CodyIDE.VSCode,
    } as ClientCapabilitiesWithLegacyFields,
    authStatus: {
        authenticated: true,
        endpoint: 'https://sourcegraph.com',
        username: 'testuser',
        displayName: 'Test User',
        pendingValidation: false,
        hasVerifiedEmail: true,
        requiresVerifiedEmail: false,
    } as AuthenticatedAuthStatus,
    isDotComUser: true,
    userProductSubscription: null,
    ...overrides,
})

export const CodyProUser: Story = {
    render: args => (
        <ConfigProvider
            value={createMockConfig({
                userProductSubscription: { plan: 'PRO' },
            })}
        >
            <AccountTab {...args} />
        </ConfigProvider>
    ),
}

export const CodyFreeUser: Story = {
    render: args => (
        <ConfigProvider
            value={createMockConfig({
                userProductSubscription: undefined,
            })}
        >
            <AccountTab {...args} />
        </ConfigProvider>
    ),
}

export const EnterpriseUser: Story = {
    render: args => (
        <ConfigProvider
            value={createMockConfig({
                isDotComUser: false,
                authStatus: {
                    authenticated: true,
                    endpoint: 'https://sourcegraph.company.com',
                    username: 'enterpriseuser',
                    displayName: 'Enterprise User',
                    primaryEmail: 'enterprise@company.com',
                    pendingValidation: false,
                    hasVerifiedEmail: true,
                    requiresVerifiedEmail: false,
                } as AuthenticatedAuthStatus,
            })}
        >
            <AccountTab {...args} />
        </ConfigProvider>
    ),
}
