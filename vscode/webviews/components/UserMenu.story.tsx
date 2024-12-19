import { AUTH_STATUS_FIXTURE_AUTHED } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import type { View } from '../tabs'
import { UserMenu } from './UserMenu'

const meta: Meta<typeof UserMenu> = {
    title: 'cody/UserMenu',
    component: UserMenu,
    decorators: [story => <div className="tw-m-5">{story()}</div>, VSCodeStandaloneComponent],
    args: {
        setView: (view: View) => console.log('View changed to:', view),
        endpointHistory: ['https://sourcegraph.com', 'https://sourcegraph.example.com'],
        __storybook__open: true, // Keep menu open for story display
    },
}

export default meta

type Story = StoryObj<typeof UserMenu>

export const ProUser: Story = {
    args: {
        isProUser: true,
        authStatus: {
            ...AUTH_STATUS_FIXTURE_AUTHED,
            displayName: 'Tim Lucas',
            username: 'tim',
            avatarURL: 'https://avatars.githubusercontent.com/u/153?v=4',
            authenticated: true,
            hasVerifiedEmail: true,
            requiresVerifiedEmail: false,
            endpoint: 'https://sourcegraph.com',
        },
    },
}

export const FreeUser: Story = {
    args: {
        isProUser: false,
        authStatus: {
            ...AUTH_STATUS_FIXTURE_AUTHED,
            displayName: 'Free Tim',
            username: 'free-tim',
            primaryEmail: 'free@example.com',
            endpoint: 'https://sourcegraph.com',
            avatarURL: 'https://avatars.githubusercontent.com/u/153?v=4',
            authenticated: true,
            hasVerifiedEmail: true,
            requiresVerifiedEmail: false,
        },
    },
}

export const EnterpriseUser: Story = {
    args: {
        isProUser: false,
        authStatus: {
            ...AUTH_STATUS_FIXTURE_AUTHED,
            username: 'enterprise-tim',
            displayName: 'Enterprise Tim',
            primaryEmail: 'enterprise-tim@sourcegraph.enterprise.com',
            avatarURL: 'https://avatars.githubusercontent.com/u/153?v=4',
            endpoint: 'https://sourcegraph.enterprise.com',
        },
    },
}

export const NoDisplayName: Story = {
    args: {
        isProUser: false,
        authStatus: {
            ...AUTH_STATUS_FIXTURE_AUTHED,
            username: 'username-only',
            primaryEmail: 'user@example.com',
            endpoint: 'https://sourcegraph.com',
        },
    },
}

export const LongEmail: Story = {
    args: {
        isProUser: false,
        authStatus: {
            ...AUTH_STATUS_FIXTURE_AUTHED,
            username: 'username',
            primaryEmail: 'username-has-a-very-long-email@example.com',
            endpoint: 'https://test.sourcegraph.com',
        },
    },
}
