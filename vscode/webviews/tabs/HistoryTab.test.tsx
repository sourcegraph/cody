import { CodyIDE } from '@sourcegraph/cody-shared'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { AppWrapperForTest } from '../AppWrapperForTest'
import { HistoryTabWithData } from './HistoryTab'

describe('HistoryTabWithData', () => {
    test('renders empty state when there are no non-empty chats', () => {
        const mockSetView = vi.fn()
        const emptyChats = [
            { id: '1', interactions: [], lastInteractionTimestamp: new Date().toISOString() },
            { id: '2', interactions: [], lastInteractionTimestamp: new Date().toISOString() },
        ]

        render(<HistoryTabWithData IDE={CodyIDE.VSCode} setView={mockSetView} chats={emptyChats} />, {
            wrapper: AppWrapperForTest,
        })

        expect(screen.getByText('You have no chat history')).toBeInTheDocument()
        expect(screen.getByText('Start a new chat')).toBeInTheDocument()
    })

    test('searches for a human message in chat history and displays the correct message', () => {
        const mockSetView = vi.fn()
        const chats = [
            {
                id: '1',
                interactions: [
                    { humanMessage: { text: 'Hello, how are you?' }, assistantMessage: null },
                ],
                lastInteractionTimestamp: new Date().toISOString(),
            },
            {
                id: '2',
                interactions: [
                    { humanMessage: { text: 'What is the weather today?' }, assistantMessage: null },
                ],
                lastInteractionTimestamp: new Date().toISOString(),
            },
        ]

        render(<HistoryTabWithData IDE={CodyIDE.VSCode} setView={mockSetView} chats={chats} />, {
            wrapper: AppWrapperForTest,
        })

        const searchInput = screen.getByPlaceholderText('Search chat history')
        fireEvent.change(searchInput, { target: { value: 'weather' } })

        expect(screen.getByText('What is the weather today?')).toBeInTheDocument()
        expect(screen.queryByText('Hello, how are you?')).not.toBeInTheDocument()
    })

    test('searches for a non-existent human message in chat history and displays no results', () => {
        const mockSetView = vi.fn()
        const chats = [
            {
                id: '1',
                interactions: [
                    { humanMessage: { text: 'Hello, how are you?' }, assistantMessage: null },
                ],
                lastInteractionTimestamp: new Date().toISOString(),
            },
            {
                id: '2',
                interactions: [
                    { humanMessage: { text: 'What is the weather today?' }, assistantMessage: null },
                ],
                lastInteractionTimestamp: new Date().toISOString(),
            },
        ]

        render(<HistoryTabWithData IDE={CodyIDE.VSCode} setView={mockSetView} chats={chats} />, {
            wrapper: AppWrapperForTest,
        })

        const searchInput = screen.getByPlaceholderText('Search chat history')
        fireEvent.change(searchInput, { target: { value: 'non-existent message' } })

        expect(screen.queryByText('Hello, how are you?')).not.toBeInTheDocument()
        expect(screen.queryByText('What is the weather today?')).not.toBeInTheDocument()
        expect(screen.getByText('You have no chat history')).toBeInTheDocument()
    })
})
