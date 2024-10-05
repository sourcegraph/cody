import {
    type AuthenticatedAuthStatus,
    type ClientCapabilitiesWithLegacyFields,
    CodyIDE,
    type LegacyWebviewConfig,
} from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import { LegacyWebviewConfigProviderForTestsOnly } from '../utils/useLegacyWebviewConfig'
import { AccountTab } from './AccountTab'

const meta: Meta<typeof AccountTab> = {
    title: 'cody/AccountTab',
    component: AccountTab,
    decorators: [
        story => <div style={{ maxWidth: '700px', margin: '2rem' }}>{story()}</div>,
        VSCodeStandaloneComponent,
    ],
    args: {
        setView: () => {
            console.log('setView called')
        },
    },
}

export default meta

type Story = StoryObj<typeof AccountTab>

const createMockConfig = (overrides = {}) => ({
    config: {
        smartApply: false,
        experimentalNoodle: false,
        serverEndpoint: 'https://sourcegraph.com',
        uiKindIsWeb: false,
    } satisfies LegacyWebviewConfig['config'],
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
    configFeatures: {
        chat: true,
        attribution: true,
        serverSentModels: true,
    },
    ...overrides,
})

export const CodyProUser: Story = {
    render: args => (
        <LegacyWebviewConfigProviderForTestsOnly
            value={createMockConfig({
                userProductSubscription: { plan: 'PRO' },
            })}
        >
            <AccountTab {...args} />
        </LegacyWebviewConfigProviderForTestsOnly>
    ),
}

export const CodyFreeUser: Story = {
    render: args => (
        <LegacyWebviewConfigProviderForTestsOnly
            value={createMockConfig({
                userProductSubscription: undefined,
            })}
        >
            <AccountTab {...args} />
        </LegacyWebviewConfigProviderForTestsOnly>
    ),
}

export const EnterpriseUser: Story = {
    render: args => (
        <LegacyWebviewConfigProviderForTestsOnly
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
        </LegacyWebviewConfigProviderForTestsOnly>
    ),
}
