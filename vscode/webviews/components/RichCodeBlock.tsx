import type { Guardrails } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { LRUCache } from 'lru-cache'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CodyTaskState } from '../../src/non-stop/state'
import type { CodeBlockActionsProps } from '../chat/ChatMessageContent/ChatMessageContent'
import styles from '../chat/ChatMessageContent/ChatMessageContent.module.css'
import { createAdditionsDeletions, createEditButtons } from '../chat/ChatMessageContent/EditButtons'
import { getCodeBlockId } from '../chat/ChatMessageContent/utils'
import { type ClientActionListener, useClientActionListener } from '../client/clientState'
import { useConfig } from '../utils/useConfig'
import { CodeBlockPlaceholder } from './CodeBlockPlaceholder'
import { GuardrailsApplicator } from './GuardrailsApplicator'

interface RichCodeBlockProps {
    hasEditIntent: boolean
    plainCode: string // Raw text for copying/executing without HTML markup
    markdownCode: string // The exact Markdown source string including the ``` fences
    language?: string
    fileName?: string
    isMessageLoading: boolean // Whether the whole message is done loading
    isCodeComplete: boolean // Whether this code block has been completed
    isShellCommand: boolean
    guardrails: Guardrails
    onCopy?: (code: string) => void
    onInsert?: (code: string, newFile?: boolean) => void
    onExecute?: (command: string) => void
    onRegenerate?: (code: string, language: string | undefined) => void
    smartApply?: CodeBlockActionsProps['smartApply']
    className?: string
    children?: React.ReactNode
}

// A set of edits we have requested smart apply to prefetch.
const prefetchedEdits = new LRUCache<string, boolean>({ max: 100 })

/**
 * RichCodeBlock is a component that displays code with syntax highlighting,
 * a toolbar to copy/insert/apply/execute the code, and guardrails checks.
 *
 * Note: This component waits for isCodeComplete to be true before
 * triggering any guardrails or smart apply caching, which prevents making
 * excessive API calls during incremental code block generation.
 */
export const RichCodeBlock: React.FC<RichCodeBlockProps> = ({
    hasEditIntent,
    plainCode,
    markdownCode,
    language,
    fileName,
    isMessageLoading,
    isCodeComplete,
    isShellCommand,
    guardrails,
    onCopy,
    onInsert,
    onExecute,
    onRegenerate,
    smartApply,
    className,
    children,
}) => {
    // TODO: When createEditorButtons supports a generic capability for popup
    // menus, remove this; it is only used to detect whether the IDE is VSCode.
    const config = useConfig()

    // Smart apply is only applicable if the code is complete. These properties
    // will be stable (undefined) until the code is complete, skipping any
    // updates caused by incomplete code as it is streamed.
    const smartApplyCode = smartApply && isCodeComplete && !isShellCommand ? plainCode : undefined
    const smartApplyFilename = smartApply && isCodeComplete && !isShellCommand ? fileName : undefined
    const thisTaskId = useMemo(() => {
        if (!smartApplyCode) {
            return undefined
        }
        const codeBlockId = getCodeBlockId(smartApplyCode, smartApplyFilename)
        return codeBlockId
    }, [smartApplyCode, smartApplyFilename])

    const [smartApplyState, setSmartApplyState] = useState<CodyTaskState | undefined>(undefined)

    const onSmartApply = useCallback(() => {
        if (!(smartApply && thisTaskId && smartApplyCode)) {
            return
        }

        // We intercept the `onSubmit` to mark this task as working as early as we can.
        // In reality, this will happen once we determine the task selection and _then_ start the task.
        // The user does not need to be aware of this, for their purposes this is a single operation.
        // We can re-use the `Working` state to simplify our UI logic.
        setSmartApplyState(CodyTaskState.Working)

        smartApply.onSubmit({
            id: thisTaskId,
            text: smartApplyCode,
            fileName: smartApplyFilename,
        })
    }, [smartApply, thisTaskId, smartApplyCode, smartApplyFilename])

    // Prefetch smart apply data for completed code blocks
    useEffect(() => {
        if (!(smartApply && thisTaskId && smartApplyCode)) {
            return
        }

        // Skip if we've already prefetched for this block
        if (prefetchedEdits.has(thisTaskId)) {
            return
        }

        // Mark as prefetched
        prefetchedEdits.set(thisTaskId, true)

        // Prefetch smart apply data
        smartApply.onSubmit({
            id: thisTaskId,
            text: smartApplyCode,
            isPrefetch: true,
        })
    }, [smartApply, thisTaskId, smartApplyCode])

    useClientActionListener(
        // Always subscribe but listen only smart apply result events
        { isActive: true, selector: event => !!event.smartApplyResult },
        useCallback<ClientActionListener>(
            ({ smartApplyResult }) => {
                if (smartApplyResult && smartApplyResult.taskId === thisTaskId) {
                    setSmartApplyState(smartApplyResult.taskState)
                }
            },
            [thisTaskId]
        )
    )

    const onExecuteThisScript = useCallback(() => {
        onExecute?.(plainCode)
    }, [onExecute, plainCode])

    const additionsDeletions = smartApply ? (
        <div className={styles.buttonContainer}>
            {createAdditionsDeletions({
                hasEditIntent,
                preText: plainCode,
            })}
        </div>
    ) : undefined

    const actionButtons = (
        <div className={styles.actionButtons}>
            {isCodeComplete &&
                createEditButtons({
                    isVSCode: config.clientCapabilities.isVSCode,
                    preText: plainCode,
                    copyButtonOnSubmit: onCopy,
                    onInsert,
                    onSmartApply,
                    onExecute: onExecute && onExecuteThisScript,
                    smartApply,
                    smartApplyId: thisTaskId,
                    smartApplyState,
                    isCodeComplete,
                    fileName,
                })}
        </div>
    )

    return (
        <GuardrailsApplicator
            plainCode={plainCode} // Use plain text code for guardrails checks
            markdownCode={markdownCode} // Use markdown for regeneration, we must replace the exact string in the transcript
            language={language}
            fileName={fileName}
            guardrails={guardrails}
            isMessageLoading={isMessageLoading}
            isCodeComplete={isCodeComplete}
            onRegenerate={onRegenerate}
        >
            {({ showCode, guardrailsStatus, guardrailsStatusDisplay }) => (
                <div className={clsx('tw-overflow-hidden', className)}>
                    {!showCode ? (
                        // When code shouldn't be show, display a placeholder
                        <CodeBlockPlaceholder text={plainCode} status={guardrailsStatus} />
                    ) : (
                        // Otherwise show the actual code with syntax highlighting
                        <pre className={styles.content}>{children}</pre>
                    )}

                    {/* Actions bar */}
                    {additionsDeletions}
                    <div className={styles.buttonsContainer}>
                        <div className={styles.buttons}>
                            {showCode && actionButtons}
                            {guardrailsStatusDisplay}
                        </div>
                    </div>
                </div>
            )}
        </GuardrailsApplicator>
    )
}
