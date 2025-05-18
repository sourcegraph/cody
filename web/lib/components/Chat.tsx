import * as React from 'react'
import { Chat as VsCodeChat } from 'cody-ai/webviews/Chat'
import type { ChatMessage, Guardrails } from '@sourcegraph/cody-shared'
import type { View } from 'cody-ai/webviews/tabs'
import type { VSCodeWrapper } from 'cody-ai/webviews/utils/VSCodeApi'
import { ThinkingDisplay } from './ThinkingDisplay'

interface ChatProps {
    chatEnabled: boolean
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    models: any[] // Using any here because the model type is not exposed
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    guardrails: Guardrails
    scrollableParent?: HTMLElement | null
    showWelcomeMessage?: boolean
    showIDESnippetActions?: boolean
    setView: (view: View) => void
    isWorkspacesUpgradeCtaEnabled?: boolean
    thinkingState?: {
        thinkContent: string
        isThinking: boolean
        isThoughtProcessOpened: boolean
        setThoughtProcessOpened: (open: boolean) => void
    }
}

export const Chat: React.FC<ChatProps> = props => {
    const { thinkingState, ...otherProps } = props
    
    // Demo thinking content for debugging - using plain text without apostrophes to avoid syntax errors
    const demoThinkingContent = 'This is a demo thinking content to test the UI. The ThinkingDisplay component should be visible above the chat content.'

    return (
        <>
            {/* Force show ThinkingDisplay for testing */}
            <div style={{ margin: '10px', padding: '10px', border: '1px dashed #999' }}>
                <strong>DEBUG:</strong> Displaying thinking content test UI
            </div>
            
            <ThinkingDisplay
                thinkContent={thinkingState?.thinkContent || demoThinkingContent}
                isThinking={thinkingState?.isThinking || false}
                isThoughtProcessOpened={thinkingState?.isThoughtProcessOpened || true}
                setThoughtProcessOpened={thinkingState?.setThoughtProcessOpened || (() => {})}
            />
            
            {/* Original conditional display */}
            {thinkingState?.thinkContent && (
                <div style={{ margin: '10px', padding: '10px', border: '1px solid #66f' }}>
                    <strong>Actual thinking content detected:</strong> {thinkingState.thinkContent}
                </div>
            )}
            
            <VsCodeChat {...otherProps} />
        </>
    )
}