import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { dummyVSCodeAPI } from '../App.story'
import { AppWrapperForTest } from '../AppWrapperForTest'
import { HistoryTabWithData } from './HistoryTab'

describe('HistoryTabWithData', () => {
    test('renders empty state when there are no non-empty chats', () => {
        const handleStartNewChat = vi.fn()
        const emptyChats = [
            { id: '1', interactions: [], lastInteractionTimestamp: new Date().toISOString() },
            { id: '2', interactions: [], lastInteractionTimestamp: new Date().toISOString() },
        ]

        render(
            <HistoryTabWithData
                vscodeAPI={dummyVSCodeAPI}
                handleStartNewChat={handleStartNewChat}
                chats={emptyChats}
            />,
            {
                wrapper: AppWrapperForTest,
            }
        )

        expect(screen.getByText('You have no chat history')).toBeInTheDocument()
        expect(screen.getByText('Start a new chat')).toBeInTheDocument()
    })
})
