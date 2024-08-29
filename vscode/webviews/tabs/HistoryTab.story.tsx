import { CodyIDE } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import { HistoryTab } from './HistoryTab'

const meta: Meta<typeof HistoryTab> = {
    title: 'cody/HistoryTab',
    component: HistoryTab,
    decorators: [VSCodeStandaloneComponent],
    render: args => (
        <div style={{ position: 'relative', padding: '1rem' }}>
            <HistoryTab {...args} />
        </div>
    ),
}

export default meta

type Story = StoryObj<typeof HistoryTab>

export const Empty: Story = {
    args: {
        IDE: CodyIDE.VSCode,
        setView: () => {},
        userHistory: [],
    },
}

export const SingleDay: Story = {
    args: {
        userHistory: [
            {
                id: '1',
                interactions: [
                    {
                        humanMessage: { speaker: 'human', text: 'How do I use React hooks?' },
                        assistantMessage: { speaker: 'assistant', text: 'Hello' },
                    },
                ],
                lastInteractionTimestamp: new Date().toISOString(),
            },
        ],
    },
}

export const MultiDay: Story = {
    args: {
        userHistory: [
            {
                id: '1',
                interactions: [
                    {
                        humanMessage: { speaker: 'human', text: 'How do I use React hooks?' },
                        assistantMessage: { speaker: 'assistant', text: 'Hello' },
                    },
                ],
                lastInteractionTimestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
            },
            {
                id: '2',
                interactions: [
                    {
                        humanMessage: { speaker: 'human', text: 'Explain TypeScript interfaces' },
                        assistantMessage: { speaker: 'assistant', text: 'Hello' },
                    },
                ],
                lastInteractionTimestamp: new Date().toISOString(),
            },
        ],
    },
}
