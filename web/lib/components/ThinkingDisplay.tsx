import * as React from 'react'
import { ThinkingCell } from './ThinkingCell'

interface ThinkingDisplayProps {
    thinkContent: string
    isThinking: boolean
    isThoughtProcessOpened: boolean
    setThoughtProcessOpened: (open: boolean) => void
}

// For testing purposes, set this to true to always show the ThinkingDisplay
// even when there's no thinking content
const ALWAYS_SHOW_THINKING = true;
const DEFAULT_THINKING_CONTENT = 'This is default thinking content for testing. The model did not provide any real thinking content.';

/**
 * Component to display thinking content in the UI
 * This is a simplified version of the ThinkingCell integration
 * that can be added to any component in the web implementation
 */
export const ThinkingDisplay: React.FC<ThinkingDisplayProps> = ({
    thinkContent,
    isThinking,
    isThoughtProcessOpened,
    setThoughtProcessOpened,
}) => {
    if (!thinkContent.length && !ALWAYS_SHOW_THINKING) {
        return null
    }

    return (
        <>
            {!thinkContent.length && ALWAYS_SHOW_THINKING && (
                <div style={{ padding: '4px 8px', background: '#ffffcc', fontSize: '12px', marginBottom: '8px' }}>
                    <strong>DEMO MODE:</strong> No real thinking content available. Showing placeholder content.
                </div>
            )}
            <ThinkingCell
                thought={thinkContent || DEFAULT_THINKING_CONTENT}
                isThinking={isThinking}
                isOpen={isThoughtProcessOpened}
                setIsOpen={setThoughtProcessOpened}
            />
        </>
    )
}