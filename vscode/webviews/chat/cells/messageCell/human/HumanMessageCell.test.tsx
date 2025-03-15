import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { HumanMessageCell } from './HumanMessageCell'

// Mock the imports
vi.mock('./editor/HumanMessageEditor', () => ({
    HumanMessageEditor: vi.fn(props => (
        <div data-testid="human-message-editor">
            <span data-testid="intent">{props.intent}</span>
            <button 
                data-testid="select-intent-button" 
                onClick={() => props.manuallySelectIntent('search')}
            >
                Select Intent
            </button>
        </div>
    )),
}))

vi.mock('../BaseMessageCell', () => ({
    BaseMessageCell: vi.fn(({ content }) => <div data-testid="base-message-cell">{content}</div>),
}))

describe('HumanMessageCell', () => {
    const defaultProps = {
        message: {
            speaker: 'human',
            text: 'Test message',
            displayText: 'Test message',
        } as any,
        models: [],
        userInfo: {} as any,
        chatEnabled: true,
        isFirstMessage: false,
        isSent: false,
        isPendingPriorResponse: false,
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        intent: 'chat' as const,
        manuallySelectIntent: vi.fn(),
    }

    it('passes intent to the HumanMessageEditor', () => {
        render(<HumanMessageCell {...defaultProps} />)
        
        // Check that the intent was passed to HumanMessageEditor
        const intentElement = screen.getByTestId('intent')
        expect(intentElement.textContent).toBe('chat')
    })

    it('passes a custom intent to the HumanMessageEditor', () => {
        render(<HumanMessageCell {...defaultProps} intent="agentic" />)
        
        // Check that the custom intent was passed to HumanMessageEditor
        const intentElement = screen.getByTestId('intent')
        expect(intentElement.textContent).toBe('agentic')
    })

    it('passes the manuallySelectIntent callback to HumanMessageEditor', async () => {
        render(<HumanMessageCell {...defaultProps} />)
        
        // Click the button that would trigger manuallySelectIntent
        screen.getByTestId('select-intent-button').click()
        
        // Check that manuallySelectIntent was called with the correct intent
        expect(defaultProps.manuallySelectIntent).toHaveBeenCalledWith('search')
    })
})