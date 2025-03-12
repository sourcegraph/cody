import { clsx } from 'clsx'
import { LRUCache } from 'lru-cache'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Guardrails, PromptString } from '@sourcegraph/cody-shared'
import type { FixupTaskID } from '../../../src/non-stop/FixupTask'
import { CodyTaskState } from '../../../src/non-stop/state'
import { type ClientActionListener, useClientActionListener } from '../../client/clientState'
import { useConfig } from '../../utils/useConfig'
import type { PriorHumanMessageInfo } from '../cells/messageCell/assistant/AssistantMessageCell'
import styles from './ChatMessageContent.module.css'
import { ThinkingCell } from './ThinkingCell'
// TODO: Fix buttons
// import { createButtons, createButtonsExperimentalUI } from './create-buttons'
import { RichMarkdown } from '../../components/RichMarkdown'
import { extractThinkContent, getCodeBlockId } from './utils'

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

    smartApplyEnabled?: boolean
    smartApply?: CodeBlockActionsProps['smartApply']

    isThoughtProcessOpened?: boolean
    setThoughtProcessOpened?: (open: boolean) => void

    guardrails: Guardrails
    className?: string
}

const prefetchedEdits = new LRUCache<string, true>({ max: 100 })

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
    smartApplyEnabled,
    smartApply,
    isThoughtProcessOpened,
    setThoughtProcessOpened,
}) => {
    const config = useConfig()

    const [smartApplyStates, setSmartApplyStates] = useState<Record<FixupTaskID, CodyTaskState>>({})
    const smartApplyInterceptor = useMemo<CodeBlockActionsProps['smartApply'] | undefined>(() => {
        if (!smartApply) {
            return
        }

        return {
            ...smartApply,
            onSubmit(params) {
                // We intercept the `onSubmit` to mark this task as working as early as we can.
                // In reality, this will happen once we determine the task selection and _then_ start the task.
                // The user does not need to be aware of this, for their purposes this is a single operation.
                // We can re-use the `Working` state to simplify our UI logic.
                setSmartApplyStates(prev => ({ ...prev, [params.id]: CodyTaskState.Working }))
                return smartApply.onSubmit(params)
            },
        }
    }, [smartApply])
    console.log('TODO, use these', smartApplyStates, smartApplyInterceptor)

    useClientActionListener(
        // Always subscribe but listen only smart apply result events
        { isActive: true, selector: event => !!event.smartApplyResult },
        useCallback<ClientActionListener>(({ smartApplyResult }) => {
            if (smartApplyResult) {
                setSmartApplyStates((prev: Record<FixupTaskID, CodyTaskState>) => ({
                    ...prev,
                    [smartApplyResult.taskId]: smartApplyResult.taskState,
                }))
            }
        }, [])
    )

    // TODO: SmartApply should be a property of the code block, not at this
    // level.

    // Prefetch smart apply data for completed code blocks
    // Note: This replaces the previous large useEffect for DOM manipulation
    useEffect(() => {
        if (!smartApplyEnabled || !smartApply || isMessageLoading) {
            return
        }

        // TODO: This is an awful heuristic, think about it.
        // Instead use the last regex match and see if the substring after it
        // contains ```

        // Only prefetch when code block is complete
        // A good heuristic is to check if we're outside a code block
        const isCodeBlockComplete = !displayMarkdown.endsWith('```')
        if (!isCodeBlockComplete) {
            return
        }

        // Find all code blocks in the markdown
        const codeBlockRegex = /```([\w-]*)\n([\s\S]*?)```/g

        for (
            let match = codeBlockRegex.exec(displayMarkdown);
            match !== null;
            match = codeBlockRegex.exec(displayMarkdown)
        ) {
            const [, language, code] = match
            if (!code.trim()) continue

            // Skip shell commands
            // TODO: Share one definition of this.
            const isShellCommand = language === 'bash' || language === 'sh'
            if (isShellCommand) continue

            // Generate ID for this code block
            const smartApplyId = getCodeBlockId(code)

            // Skip if we've already prefetched for this block
            if (prefetchedEdits.has(smartApplyId)) {
                continue
            }

            // Mark as prefetched
            prefetchedEdits.set(smartApplyId, true)

            // Prefetch smart apply data
            smartApply.onSubmit({
                id: smartApplyId,
                text: code,
                isPrefetch: true,
                instruction: humanMessage?.text,
            })
        }
    }, [smartApplyEnabled, smartApply, isMessageLoading, displayMarkdown, humanMessage])

    const { displayContent, thinkContent, isThinking } = useMemo(
        () => extractThinkContent(displayMarkdown),
        [displayMarkdown]
    )

    // TODO: check that insertButtonOnSubmit is memoized
    const onInsert = config.config.hasEditCapability ? insertButtonOnSubmit : undefined

    const onExecute = useCallback((command: string) => {
        // Execute command in terminal
        const vscodeApi = (window as any).acquireVsCodeApi?.()
        vscodeApi?.postMessage({
            command: 'command',
            id: 'cody.terminal.execute',
            arg: command.trim(),
        })
    }, [])

    // TODO: check that smartApply is memoized
    const onSmartApply = useMemo(() => {
        return smartApplyEnabled && smartApply
            ? (code: string, fileName: string | undefined) => {
                  const smartApplyId = getCodeBlockId(code, fileName)
                  smartApply.onSubmit({
                      id: smartApplyId,
                      text: code,
                      instruction: humanMessage?.text,
                      fileName,
                  })
              }
            : undefined
    }, [smartApplyEnabled, smartApply, humanMessage])

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
                onApply={onSmartApply}
                className={clsx(styles.content, className)}
            />
        </div>
    )
}
