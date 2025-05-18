import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi, type MockedFunction } from 'vitest'
import { useThinkingState } from './useThinkingState'
import * as thinkContentUtils from '../utils/thinkContent'
import type { ChatMessage } from '@sourcegraph/cody-shared'

// Mock the extractThinkContent function
vi.mock('../utils/thinkContent', () => ({
    extractThinkContent: vi.fn(),
}))

// Mock the useLocalStorage hook
vi.mock('./useLocalStorage', () => ({
    useLocalStorage: vi.fn().mockReturnValue([true, vi.fn()]),
}))

describe('useThinkingState', () => {
    let extractThinkContentMock: MockedFunction<typeof thinkContentUtils.extractThinkContent>

    beforeEach(() => {
        extractThinkContentMock = thinkContentUtils.extractThinkContent as MockedFunction<typeof thinkContentUtils.extractThinkContent>
        extractThinkContentMock.mockReset()
    })

    it('should initialize with empty thinking content', () => {
        extractThinkContentMock.mockReturnValue({
            displayContent: '',
            thinkContent: '',
            isThinking: false,
        })

        const { result } = renderHook(() => useThinkingState(null))

        expect(result.current.thinkContent).toBe('')
        expect(result.current.isThinking).toBe(false)
        expect(result.current.isThoughtProcessOpened).toBe(true) // Default from mock
    })

    it('should extract thinking content from message', () => {
        const mockMessage = { text: '<think>Planning steps</think>Code' } as ChatMessage

        extractThinkContentMock.mockReturnValue({
            displayContent: 'Code',
            thinkContent: 'Planning steps',
            isThinking: false,
        })

        const { result } = renderHook(() => useThinkingState(mockMessage))

        expect(extractThinkContentMock).toHaveBeenCalledWith('<think>Planning steps</think>Code')
        expect(result.current.thinkContent).toBe('Planning steps')
        expect(result.current.isThinking).toBe(false)
    })

    it('should handle unclosed thinking tags', () => {
        const mockMessage = { text: '<think>Still thinking...' } as ChatMessage

        extractThinkContentMock.mockReturnValue({
            displayContent: '',
            thinkContent: 'Still thinking...',
            isThinking: true,
        })

        const { result } = renderHook(() => useThinkingState(mockMessage))

        expect(result.current.thinkContent).toBe('Still thinking...')
        expect(result.current.isThinking).toBe(true)
    })

    it('should clear thinking content when message is null', () => {
        const { result, rerender } = renderHook(({ message }) => useThinkingState(message), {
            initialProps: { message: { text: '<think>Thinking</think>' } as ChatMessage },
        })

        extractThinkContentMock.mockReturnValue({
            displayContent: '',
            thinkContent: 'Thinking',
            isThinking: true,
        })

        // Re-render with null message
        rerender({ message: null })

        expect(result.current.thinkContent).toBe('')
        expect(result.current.isThinking).toBe(false)
    })
})