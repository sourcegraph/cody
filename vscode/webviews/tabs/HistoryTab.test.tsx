import { CodyIDE } from '@sourcegraph/cody-shared'
import { render, screen } from '@testing-library/react'
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
})
