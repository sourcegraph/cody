import { useState, useEffect } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { extractThinkContent } from '../utils/thinkContent'
import type { ChatMessage } from '@sourcegraph/cody-shared'

/**
 * Hook for managing thinking content state
 * Extracts thinking content from messages and manages related state
 */
export function useThinkingState(messageInProgress: ChatMessage | null) {
    // State for thinking content
    const [thinkContent, setThinkContent] = useState('')
    const [isThinking, setIsThinking] = useState(false)
    const [isThoughtProcessOpened, setIsThoughtProcessOpened] = useLocalStorage<boolean>(
        'cody.thinking-space.open',
        true
    )

    // Process message and extract thinking content
    useEffect(() => {
        console.log('useThinkingState: message changed', messageInProgress)
        
        // Check various potential sources of text content in the message
        const messageText = messageInProgress?.text || 
                           messageInProgress?.displayText || 
                           (messageInProgress as any)?.pendingText || 
                           (messageInProgress as any)?.currentCompletion;
        
        if (messageText) {
            // Convert to string in case it's not already a string
            const content = messageText.toString()
            console.log('useThinkingState: processing content', {
                content,
                source: messageInProgress?.text ? 'text' : 
                        messageInProgress?.displayText ? 'displayText' : 
                        (messageInProgress as any)?.pendingText ? 'pendingText' : 
                        (messageInProgress as any)?.currentCompletion ? 'currentCompletion' : 'unknown',
                length: content.length,
                hasThinkTag: content.includes('<think>'),
                hasCloseTag: content.includes('</think>'),
                sample: content.substring(0, 100) + (content.length > 100 ? '...' : '')
            })
            const result = extractThinkContent(content)
            console.log('useThinkingState: extracted thinking', result)
            setThinkContent(result.thinkContent)
            setIsThinking(result.isThinking)
        } else {
            console.log('useThinkingState: no text content found in message')
            setThinkContent('')
            setIsThinking(false)
        }
    }, [messageInProgress])

    return {
        thinkContent,
        isThinking,
        isThoughtProcessOpened: isThoughtProcessOpened || false,
        setThoughtProcessOpened: setIsThoughtProcessOpened,
    }
}