import { CodyIDE } from '@sourcegraph/cody-shared'
import type { LightweightChatTranscript } from '@sourcegraph/cody-shared/src/chat/transcript'
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

export const LazyLoaded: Story = {
    args: {
        IDE: CodyIDE.VSCode,
        setView: () => {},
        chats: getMockedChatData(50),
    },
}

function getMockedChatData(items: number): LightweightChatTranscript[] {
    const mockedChatData: LightweightChatTranscript[] = []

    for (let i = 3; i <= items; i++) {
        const lastTimestamp = Date.now() - Math.floor(Math.random() * 7) * 86400000 // Randomly within the last 7 days
        const firstHumanMessageText = `Question about topic ${i}-1`

        mockedChatData.push({
            id: String(i),
            chatTitle: `Chat about topic ${i}`,
            firstHumanMessageText,
            lastInteractionTimestamp: new Date(lastTimestamp).toISOString(),
        })
    }

    return mockedChatData
}
