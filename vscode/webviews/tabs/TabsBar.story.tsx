import * as Tabs from '@radix-ui/react-tabs'
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

export const ChatTab: Story = {
    args: {
        currentView: View.Chat,
        setView: () => {},
    },
}

export const HistoryTab: Story = {
    args: {
        currentView: View.History,
        setView: () => {},
    },
}

export const PromptsTab: Story = {
    args: {
        currentView: View.Prompts,
        setView: () => {},
    },
}

export const SettingsTab: Story = {
    args: {
        currentView: View.Settings,
        setView: () => {},
    },
}

export const AccountTab: Story = {
    args: {
        currentView: View.Account,
        setView: () => {},
    },
}
