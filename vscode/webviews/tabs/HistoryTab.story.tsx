import { CodyIDE } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import { HistoryTabWithData } from './HistoryTab'

const meta: Meta<typeof HistoryTabWithData> = {
    title: 'cody/HistoryTab',
    component: HistoryTabWithData,
    decorators: [VSCodeStandaloneComponent],
    render: args => (
        <div style={{ position: 'relative', padding: '1rem' }}>
            <HistoryTabWithData {...args} />
        </div>
    ),
}

export default meta

type Story = StoryObj<typeof HistoryTabWithData>

export const Empty: Story = {
    args: {
        IDE: CodyIDE.VSCode,
        setView: () => {},
        chats: [],
    },
}

export const SingleDay: Story = {
    args: {
        chats: [
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
        chats: [
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
