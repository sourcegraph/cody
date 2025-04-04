import type { Guardrails, PromptString } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import type React from 'react'
import { useCallback, useMemo } from 'react'
import { RichMarkdown } from '../../components/RichMarkdown'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
import { useConfig } from '../../utils/useConfig'
import type { PriorHumanMessageInfo } from '../cells/messageCell/assistant/AssistantMessageCell'
import styles from './ChatMessageContent.module.css'
import { ThinkingCell } from './ThinkingCell'
import { extractThinkContent } from './utils'

export interface CodeBlockActionsProps {
    copyButtonOnSubmit: (text: string, event?: 'Keydown' | 'Button') => void
    insertButtonOnSubmit: (text: string, newFile?: boolean) => void
    smartApply: {
        onSubmit: (params: {
            id: string
            text: string
            isPrefetch?: boolean
            instruction?: PromptString
            fileName?: string
        }) => void
        onAccept: (id: string) => void
        onReject: (id: string) => void
    }
}

interface ChatMessageContentProps {
    displayMarkdown: string
    isMessageLoading: boolean
    humanMessage: PriorHumanMessageInfo | null

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    smartApply?: CodeBlockActionsProps['smartApply']

    isThoughtProcessOpened?: boolean
    setThoughtProcessOpened?: (open: boolean) => void

    guardrails: Guardrails
    className?: string
}

/**
 * A component presenting the content of a chat message.
 */
export const ChatMessageContent: React.FunctionComponent<ChatMessageContentProps> = ({
    displayMarkdown,
    isMessageLoading,
    humanMessage,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    guardrails,
    className,
    smartApply,
    isThoughtProcessOpened,
    setThoughtProcessOpened,
}) => {
    const config = useConfig()

    const { displayContent, thinkContent, isThinking } = useMemo(
        () => extractThinkContent(displayMarkdown),
        [displayMarkdown]
    )

    const onInsert = config.config.hasEditCapability ? insertButtonOnSubmit : undefined

    let onExecute: ((command: string) => void) | undefined = useCallback((command: string) => {
        // Execute command in terminal
        const vscodeAPI = getVSCodeAPI()
        vscodeAPI.postMessage({
            command: 'command',
            id: 'cody.terminal.execute',
            arg: command.trim(),
        })
    }, [])

    // TODO: Replace this isVSCode check with a client capability check for
    // terminal execution when agent/src/vscode-shim.ts implements `terminal()`
    onExecute = config.clientCapabilities.isVSCode ? onExecute : undefined

    const onCopy = useCallback(
        (code: string) => copyButtonOnSubmit?.(code, 'Button'),
        [copyButtonOnSubmit]
    )

    return (
        <div data-testid="chat-message-content">
            {setThoughtProcessOpened && thinkContent.length > 0 && (
                <ThinkingCell
                    isOpen={!!isThoughtProcessOpened}
                    setIsOpen={setThoughtProcessOpened}
                    isThinking={isMessageLoading && isThinking}
                    thought={thinkContent}
                />
            )}
            <RichMarkdown
                markdown={displayContent}
                isLoading={isMessageLoading}
                guardrails={guardrails}
                onCopy={onCopy}
                onInsert={onInsert}
                onExecute={onExecute}
                smartApply={smartApply}
                className={clsx(styles.content, className)}
                hasEditIntent={humanMessage?.intent === 'edit'}
            />
        </div>
    )
}
