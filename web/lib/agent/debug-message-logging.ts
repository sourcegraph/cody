/**
 * Message logging for debugging purposes
 */

import type { ChatMessage } from '@sourcegraph/cody-shared'

/**
 * Add debug logging to a message handler
 * 
 * @param handler The original message handler
 * @returns The wrapped handler with logging
 */
export function withLogging<T extends (message: any) => void>(handler: T): T {
    // Use type assertion in a way that works with TypeScript and JS transpilation
    const wrappedHandler = (message: any) => {
        if (message.type === 'transcript') {
            console.log('⚡ DEBUG - Raw transcript message:', message)
            
            // If there are messages that might contain thinking content, log them
            if (message.messages && message.messages.length > 0) {
                const lastMessage = message.messages[message.messages.length - 1]
                if (lastMessage && typeof lastMessage === 'object' && lastMessage.text) {
                    console.log('⚡ DEBUG - Last message text:', lastMessage.text)
                    
                    // Check if the text contains thinking tags
                    if (typeof lastMessage.text === 'string' && lastMessage.text.includes('<think>')) {
                        console.log('⚡ DEBUG - Found thinking content in message:', {
                            text: lastMessage.text,
                            hasThinkTag: lastMessage.text.includes('<think>'),
                            hasThinkCloseTag: lastMessage.text.includes('</think>'),
                        })
                    }
                }
            }
        }
        
        // Call the original handler
        handler(message)
    }
    
    return wrappedHandler as unknown as T
}

/**
 * Extract thinking content from a message for debugging
 */
export function debugExtractThinking(message: ChatMessage | null): void {
    console.log('⚡ DEBUG - Message object:', message)
    
    if (!message) {
        console.log('⚡ DEBUG - Message is null')
        return
    }
    
    // Log all properties of the message
    console.log('⚡ DEBUG - Message properties:', {
        hasText: !!message.text,
        textType: message.text ? typeof message.text : 'undefined',
        speaker: message.speaker,
        displayText: message.displayText,
        displayHtml: message.displayHtml,
        buttons: message.buttons,
        allProperties: Object.keys(message)
    })
    
    if (!message?.text) {
        console.log('⚡ DEBUG - No text property in message')
        return
    }
    
    const text = message.text.toString()
    console.log('⚡ DEBUG - Extracting thinking from:', {
        text: text,
        hasThinkTag: text.includes('<think>'),
        hasThinkCloseTag: text.includes('</think>'),
    })
    
    // Simple regex to extract thinking content
    const thinkingMatch = text.match(/<think>(.*?)<\/think>/s)
    if (thinkingMatch) {
        console.log('⚡ DEBUG - Extracted thinking content:', thinkingMatch[1])
    } else if (text.includes('<think>')) {
        // Might be an incomplete thinking tag
        console.log('⚡ DEBUG - Incomplete thinking tag found')
        const partialContent = text.split('<think>')[1]
        console.log('⚡ DEBUG - Partial thinking content:', partialContent)
    }
}