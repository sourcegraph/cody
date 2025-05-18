import React from 'react'
import { CodyPanel as VsCodeCodyPanel } from 'cody-ai/webviews/CodyPanel'
import type { CodyPanelProps as VsCodeCodyPanelProps } from 'cody-ai/webviews/CodyPanel'
import { Chat } from './Chat'

// Extended props interface with thinking state
export interface CodyPanelProps extends Omit<VsCodeCodyPanelProps, 'children'> {
    thinkingState?: {
        thinkContent: string
        isThinking: boolean
        isThoughtProcessOpened: boolean
        setThoughtProcessOpened: (open: boolean) => void
    }
}

/**
 * Wrap the VS Code CodyPanel component to support thinking state
 */
export const CodyPanel: React.FC<CodyPanelProps> = props => {
    const { thinkingState, ...otherProps } = props

    return (
        <VsCodeCodyPanel 
            {...otherProps} 
            // Replace the Chat component with our custom Chat component
            // that supports thinking state
        >
            <Chat 
                chatEnabled={otherProps.chatEnabled}
                messageInProgress={otherProps.messageInProgress}
                transcript={otherProps.transcript || []}
                models={otherProps.models || []}
                vscodeAPI={otherProps.vscodeAPI}
                guardrails={otherProps.guardrails}
                setView={otherProps.setView}
                showWelcomeMessage={otherProps.showWelcomeMessage}
                showIDESnippetActions={otherProps.showIDESnippetActions}
                isWorkspacesUpgradeCtaEnabled={otherProps.isWorkspacesUpgradeCtaEnabled}
                thinkingState={thinkingState}
            />
        </VsCodeCodyPanel>
    )
}