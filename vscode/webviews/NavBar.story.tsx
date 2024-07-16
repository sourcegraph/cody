import type { Meta, StoryObj } from '@storybook/react'
import { NavBar, View } from './NavBar'
import { VSCodeStandaloneComponent } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof NavBar> = {
    title: 'cody/NavBar',
    component: NavBar,
    decorators: [VSCodeStandaloneComponent],
    render: args => (
        <div style={{ position: 'relative', padding: '1rem' }}>
            <NavBar {...args} />
        </div>
    ),
}

export default meta

type Story = StoryObj<typeof NavBar>

export const DefaultNavBar: Story = {
    args: {
        currentView: View.Chat,
        setView: () => {},
    },
}

export const HistoryView: Story = {
    args: {
        currentView: View.History,
        setView: () => {},
    },
}

export const CommandsView: Story = {
    args: {
        currentView: View.Commands,
        setView: () => {},
    },
}

export const SettingsView: Story = {
    args: {
        currentView: View.Settings,
        setView: () => {},
    },
}

export const AccountView: Story = {
    args: {
        currentView: View.Account,
        setView: () => {},
    },
}
