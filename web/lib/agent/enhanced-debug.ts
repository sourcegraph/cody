/**
 * Enhanced message logging for debugging purposes
 */

import type { ChatMessage } from '@sourcegraph/cody-shared'

/**
 * More detailed extraction of message properties for debugging
 */
export function enhancedDebugExtractThinking(message: ChatMessage | null): void {
    console.log('u26a1 ENHANCED DEBUG - Message object:', message)
    
    if (!message) {
        console.log('u26a1 ENHANCED DEBUG - Message is null')
        return
    }
    
    // Log all properties of the message
    console.log('u26a1 ENHANCED DEBUG - Message properties:', {
        hasText: !!message.text,
        textType: message.text ? typeof message.text : 'undefined',
        speaker: message.speaker,
        // Use type casting to avoid TypeScript errors
        displayText: (message as any).displayText,
        displayHtml: (message as any).displayHtml,
        buttons: (message as any).buttons,
        allProperties: Object.keys(message)
    })
    
    if (!message?.text) {
        console.log('u26a1 ENHANCED DEBUG - No text property in message')
        return
    }
    
    const text = message.text.toString()
    console.log('u26a1 ENHANCED DEBUG - Text content:', text)
    
    // Check if thinking tags exist
    const hasThinkTag = text.includes('<think>')
    const hasThinkCloseTag = text.includes('</think>')
    
    console.log('u26a1 ENHANCED DEBUG - Thinking tags:', {
        hasThinkTag,
        hasThinkCloseTag,
        textLength: text.length,
        // Show first 100 characters for quick view
        textSample: text.substring(0, 100) + (text.length > 100 ? '...' : '')
    })
    
    // Simple regex to extract thinking content
    const thinkingMatch = text.match(/<think>(.*?)<\/think>/s)
    if (thinkingMatch) {
        console.log('u26a1 ENHANCED DEBUG - Extracted thinking content:', thinkingMatch[1])
    } else if (hasThinkTag) {
        // Might be an incomplete thinking tag
        console.log('u26a1 ENHANCED DEBUG - Incomplete thinking tag found')
        const partialContent = text.split('<think>')[1]
        console.log('u26a1 ENHANCED DEBUG - Partial thinking content:', partialContent)
    }
}