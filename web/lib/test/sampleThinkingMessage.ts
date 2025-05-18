import type { ChatMessage } from '@sourcegraph/cody-shared'

/**
 * Sample message with thinking content for testing ThinkingCell implementation
 */
export const sampleThinkingMessage: ChatMessage = {
    speaker: 'assistant',
    text: 'I need to analyze this code. <think>First, I need to understand the main components. The code seems to be using React hooks for state management. It is also using a custom hook called useThinkingState to manage thinking content. The main component structure is CodyWebChat -> CodyWebPanel -> Chat.</think> Based on my analysis, the code uses React hooks for state management and has a clear component hierarchy.',
    displayText: 'I need to analyze this code. Based on my analysis, the code uses React hooks for state management and has a clear component hierarchy.',
    displayHtml: 'I need to analyze this code. Based on my analysis, the code uses React hooks for state management and has a clear component hierarchy.',
    buttons: [],
    contextFiles: [],
    secretContextFiles: [],
    telemetryMetadata: {},
    id: 'test-message-1',
}

/**
 * A helper function to create a new chat message with thinking content
 */
export function createThinkingMessage(text: string, thinkContent: string): ChatMessage {
    return {
        speaker: 'assistant',
        text: `${text.split('<think>')[0]} <think>${thinkContent}</think> ${text.split('</think>')[1] || ''}`.replace(/'/g, "'"),  // Replace all apostrophes with single quotes
        displayText: text,
        displayHtml: text,
        buttons: [],
        contextFiles: [],
        secretContextFiles: [],
        telemetryMetadata: {},
        id: `thinking-message-${Date.now()}`,
    }
}