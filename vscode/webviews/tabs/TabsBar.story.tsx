import * as Tabs from '@radix-ui/react-tabs'
import { CodyIDE } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import { TabsBar } from './TabsBar'
import { View } from './types'

const meta: Meta<typeof TabsBar> = {
    title: 'cody/TabsBar',
    component: TabsBar,
    decorators: [VSCodeStandaloneComponent],
    render: args => (
        <Tabs.Root
            defaultValue="chat"
            orientation="vertical"
            style={{ position: 'relative', padding: '1rem' }}
        >
            <TabsBar {...args} />
        </Tabs.Root>
    ),
}

export default meta

type Story = StoryObj<typeof TabsBar>

const mockUser = {
    isCodyProUser: false,
    isDotComUser: true,
    IDE: CodyIDE.VSCode,
    user: {
        id: '1',
        username: 'test',
        email: 'test@example.com',
        isPro: false,
        hasVerifiedEmail: true,
        endpoint: 'https://sourcegraph.com',
    },
}

export const ChatTab: Story = {
    args: {
        currentView: View.Chat,
        setView: () => {},
        user: mockUser,
    },
}

export const HistoryTab: Story = {
    args: {
        currentView: View.History,
        setView: () => {},
        user: mockUser,
    },
}

export const PromptsTab: Story = {
    args: {
        currentView: View.Prompts,
        setView: () => {},
        user: mockUser,
    },
}

export const SettingsTab: Story = {
    args: {
        currentView: View.Settings,
        setView: () => {},
        user: mockUser,
    },
}

export const AccountTab: Story = {
    args: {
        currentView: View.Account,
        setView: () => {},
        user: mockUser,
    },
}
