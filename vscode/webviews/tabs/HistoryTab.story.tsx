import { CodyIDE, type UserLocalHistory } from '@sourcegraph/cody-shared'
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
        chats: [],
    },
}

export const SingleDay: Story = {
    args: {
        IDE: CodyIDE.VSCode,
        setView: () => {},
        chats: [
            {
                id: '1',
                lastInteractionTimestamp: new Date(Date.now() - 86400000).toISOString(),
                chatTitle: 'React hooks',
                firstHumanMessageText: 'How do I use React hooks?',
            },
        ],
    },
}

export const MultiDay: Story = {
    args: {
        IDE: CodyIDE.VSCode,
        setView: () => {},
        chats: [
            {
                id: '1',
                chatTitle: 'React hooks',
                firstHumanMessageText: 'How do I use React hooks?',
                lastInteractionTimestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
            },
            {
                id: '2',
                chatTitle: 'TypeScript interfaces',
                firstHumanMessageText: 'Explain TypeScript interfaces',
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
