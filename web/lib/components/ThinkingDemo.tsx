import React, { useState, useEffect } from 'react'
import { ThinkingDisplay } from './ThinkingDisplay'
import { sampleThinkingMessage, createThinkingMessage } from '../test/sampleThinkingMessage'
import { extractThinkContent } from '../utils/thinkContent'
import { useLocalStorage } from '../hooks/useLocalStorage'

/**
 * A simple demo component to showcase the ThinkingCell functionality
 */
export const ThinkingDemo: React.FC = () => {
    const [currentMessage, setCurrentMessage] = useState(sampleThinkingMessage)
    const [thinkContent, setThinkContent] = useState('')
    const [isThinking, setIsThinking] = useState(false)
    const [isThoughtProcessOpened, setIsThoughtProcessOpened] = useLocalStorage<boolean>(
        'cody.thinking-space.open',
        true
    )

    // Custom message input
    const [customMessage, setCustomMessage] = useState('')
    const [customThinking, setCustomThinking] = useState('')

    // Process message and extract thinking content
    useEffect(() => {
        if (currentMessage?.text) {
            const content = currentMessage.text.toString()
            const result = extractThinkContent(content)
            setThinkContent(result.thinkContent)
            setIsThinking(result.isThinking)
        } else {
            setThinkContent('')
            setIsThinking(false)
        }
    }, [currentMessage])

    // Create a new message with custom thinking content
    const handleCreateMessage = () => {
        const newMessage = createThinkingMessage(customMessage, customThinking)
        setCurrentMessage(newMessage)
    }

    return (
        <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            <h1>ThinkingCell Demo</h1>
            
            <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
                <h2>Message</h2>
                <p>{currentMessage.text}</p>
            </div>

            {thinkContent && (
                <ThinkingDisplay
                    thinkContent={thinkContent}
                    isThinking={isThinking}
                    isThoughtProcessOpened={isThoughtProcessOpened || false}
                    setThoughtProcessOpened={setIsThoughtProcessOpened}
                />
            )}

            <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
                <h2>Create Custom Message with Thinking</h2>
                
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>
                        Display Message:
                    </label>
                    <input 
                        type="text" 
                        value={customMessage} 
                        onChange={e => setCustomMessage(e.target.value)}
                        style={{ width: '100%', padding: '8px' }}
                        placeholder="Message to display"
                    />
                </div>
                
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>
                        Thinking Content:
                    </label>
                    <textarea 
                        value={customThinking} 
                        onChange={e => setCustomThinking(e.target.value)}
                        style={{ width: '100%', height: '100px', padding: '8px' }}
                        placeholder="Enter thinking content"
                    />
                </div>
                
                <button 
                    onClick={handleCreateMessage}
                    style={{ padding: '8px 16px', backgroundColor: '#4a89dc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                    Create Message
                </button>
            </div>
        </div>
    )
}