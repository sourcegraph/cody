import type { LightweightUserHistory } from '@sourcegraph/cody-shared'
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
        paginatedHistory: { items: [], totalCount: 0, currentPage: 0, pageSize: 0, hasNextPage: false },
        vscodeAPI: dummyVSCodeAPI,
        handleStartNewChat: () => {},
    },
}

export const SingleDay: Story = {
    args: {
        paginatedHistory: {
            items: [
                {
                    id: '1',
                    lastInteractionTimestamp: new Date().toISOString(),
                    lastHumanMessageText: 'How do I use React hooks?',
                    chatTitle: 'React Hooks Usage',
                },
            ],
            totalCount: 2,
            currentPage: 0,
            pageSize: 2,
            hasNextPage: false,
        },
        vscodeAPI: dummyVSCodeAPI,
        handleStartNewChat: () => {},
    },
}

export const MultiDay: Story = {
    args: {
        paginatedHistory: {
            items: [
                {
                    id: '1',
                    lastInteractionTimestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
                    lastHumanMessageText: 'What is a JavaScript closure?',
                    chatTitle: 'JavaScript Closures',
                },
                {
                    id: '2',
                    lastInteractionTimestamp: new Date().toISOString(),
                    lastHumanMessageText: 'Help me with React hooks',
                    chatTitle: 'React Hooks Help',
                },
            ],
            totalCount: 2,
            currentPage: 0,
            pageSize: 2,
            hasNextPage: false,
        },
        vscodeAPI: dummyVSCodeAPI,
        handleStartNewChat: () => {},
    },
}

export const Paginated: Story = {
    args: {
        paginatedHistory: {
            items: getMockedChatData(50),
            totalCount: 50,
            currentPage: 0,
            pageSize: 50,
            hasNextPage: false,
        },
        vscodeAPI: dummyVSCodeAPI,
        handleStartNewChat: () => {},
    },
}

function getMockedChatData(items: number): LightweightUserHistory['chat'][string][] {
    const mockedChatData: LightweightUserHistory['chat'][string][] = []

    for (let i = 3; i <= items; i++) {
        const lastTimestamp = Date.now() - Math.floor(Math.random() * 7) * 86400000 // Randomly within the last 7 days
        const humanMessageText = `Question about topic ${i}`

        mockedChatData.push({
            id: String(i),
            lastHumanMessageText: humanMessageText,
            lastInteractionTimestamp: new Date(lastTimestamp).toISOString(),
            chatTitle: i % 2 === 0 ? `Chat about topic ${i}` : undefined,
        })
    }

    return mockedChatData
}
