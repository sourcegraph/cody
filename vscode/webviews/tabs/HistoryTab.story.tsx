import type { UserLocalHistory } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { dummyVSCodeAPI } from '../App.story'
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
        vscodeAPI: dummyVSCodeAPI,
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
                lastInteractionTimestamp: new Date(Date.now() - 86400000).toISOString(),
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

export const Paginated: Story = {
    args: {
        chats: getMockedChatData(50),
    },
}

function getMockedChatData(items: number): UserLocalHistory['chat'][string][] {
    const mockedChatData: UserLocalHistory['chat'][string][] = []

    for (let i = 3; i <= items; i++) {
        const numInteractions = Math.floor(Math.random() * 3) + 1 // 1-3 interactions
        const interactions = []
        const lastTimestamp = Date.now() - Math.floor(Math.random() * 7) * 86400000 // Randomly within the last 7 days

        for (let j = 0; j < numInteractions; j++) {
            const humanMessageText = `Question about topic ${i}-${j + 1}`
            interactions.push({
                humanMessage: {
                    speaker: 'human' as const,
                    text: humanMessageText,
                },
                assistantMessage: {
                    speaker: 'assistant' as const,
                    text: `Answer to question ${i}-${j + 1}`,
                },
            })
        }

        mockedChatData.push({
            id: String(i),
            interactions: interactions,
            lastInteractionTimestamp: new Date(lastTimestamp).toISOString(),
        })
    }

    return mockedChatData
}
