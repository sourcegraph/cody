import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { Chat } from './Chat'
import { sampleThinkingMessage, createThinkingMessage } from '../test/sampleThinkingMessage'
import type { ChatMessage } from '@sourcegraph/cody-shared'

// Mock the VS Code API
const mockVSCodeAPI = {
    postMessage: jest.fn(),
    onMessage: jest.fn(),
}

// Mock any dependencies we need
jest.mock('cody-ai/webviews/Chat', () => ({
    __esModule: true,
    Chat: ({ children }: { children: React.ReactNode }) => <div data-testid="vscode-chat">{children}</div>,
}))

describe('ThinkingCell Integration', () => {
    // Test the basic rendering of the ThinkingDisplay component
    it('should display thinking content when available', () => {
        // Setup thinking state
        const thinkingState = {
            thinkContent: 'This is a test thinking content',
            isThinking: true,
            isThoughtProcessOpened: true,
            setThoughtProcessOpened: jest.fn(),
        }

        // Render the component
        render(
            <Chat
                chatEnabled={true}
                messageInProgress={sampleThinkingMessage}
                transcript={[]}
                models={[]}
                vscodeAPI={mockVSCodeAPI}
                guardrails={{} as any}
                setView={() => {}}
                thinkingState={thinkingState}
            />
        )

        // Verify thinking content is displayed
        expect(screen.getByText('This is a test thinking content')).toBeInTheDocument()
    })

    // Test that thinking content is not displayed when there is none
    it('should not display thinking content when not available', () => {
        // Setup thinking state with empty content
        const thinkingState = {
            thinkContent: '',
            isThinking: false,
            isThoughtProcessOpened: true,
            setThoughtProcessOpened: jest.fn(),
        }

        // Render the component
        render(
            <Chat
                chatEnabled={true}
                messageInProgress={null}
                transcript={[]}
                models={[]}
                vscodeAPI={mockVSCodeAPI}
                guardrails={{} as any}
                setView={() => {}}
                thinkingState={thinkingState}
            />
        )

        // ThinkingDisplay should not be in the document
        expect(screen.queryByTestId('thinking-cell')).not.toBeInTheDocument()
    })

    // Test toggling the thinking cell visibility
    it('should toggle thinking cell visibility when clicked', () => {
        const setThoughtProcessOpened = jest.fn()
        
        // Setup thinking state
        const thinkingState = {
            thinkContent: 'Toggling test',
            isThinking: false,
            isThoughtProcessOpened: true,
            setThoughtProcessOpened,
        }

        // Render the component
        render(
            <Chat
                chatEnabled={true}
                messageInProgress={createThinkingMessage('Display text', 'Toggling test')}
                transcript={[]}
                models={[]}
                vscodeAPI={mockVSCodeAPI}
                guardrails={{} as any}
                setView={() => {}}
                thinkingState={thinkingState}
            />
        )

        // Find the toggle button and click it
        const toggleButton = screen.getByText('Thinking')
        fireEvent.click(toggleButton)

        // Verify the thinking cell visibility was toggled
        expect(setThoughtProcessOpened).toHaveBeenCalledWith(false)
    })
})