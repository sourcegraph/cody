import type { Guardrails } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { LRUCache } from 'lru-cache'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CodyTaskState } from '../../src/non-stop/state'
import type { CodeBlockActionsProps } from '../chat/ChatMessageContent/ChatMessageContent'
import styles from '../chat/ChatMessageContent/ChatMessageContent.module.css'
import { createEditButtons, createExecuteButton } from '../chat/ChatMessageContent/EditButtons'
import { getCodeBlockId } from '../chat/ChatMessageContent/utils'
import { type ClientActionListener, useClientActionListener } from '../client/clientState'
import { useConfig } from '../utils/useConfig'
import { CodeBlockPlaceholder } from './CodeBlockPlaceholder'
import { GuardrailsApplicator } from './GuardrailsApplicator'

interface RichCodeBlockProps {
    hasEditIntent: boolean
    code: string // Raw text for copying/executing without HTML markup
    language?: string
    fileName?: string
    isCodeComplete: boolean
    isShellCommand: boolean
    guardrails: Guardrails
    onCopy?: (code: string) => void
    onInsert?: (code: string, newFile?: boolean) => void
    onExecute?: (command: string) => void
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
    code,
    language,
    fileName,
    isCodeComplete,
    isShellCommand,
    guardrails,
    onCopy,
    onInsert,
    onExecute,
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
    const smartApplyCode = smartApply && isCodeComplete && !isShellCommand ? code : undefined
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

    const actionButtons = (
        <div className={styles.actionButtons}>
            {isCodeComplete &&
                createEditButtons({
                    hasEditIntent,
                    isVSCode: config.clientCapabilities.isVSCode,
                    preText: code,
                    copyButtonOnSubmit: onCopy,
                    onInsert,
                    onSmartApply,
                    smartApply,
                    smartApplyId: thisTaskId,
                    smartApplyState,
                    isCodeComplete,
                    fileName,
                    isShellCommand,
                })}

            {isCodeComplete && isShellCommand && onExecute && createExecuteButton(code)}
        </div>
    )

    return (
        <GuardrailsApplicator
            code={code} // Use raw code for guardrails checks
            language={language}
            fileName={fileName}
            guardrails={guardrails}
            isCodeComplete={isCodeComplete}
        >
            {({ showCode, guardrailsStatus }) => (
                <div className={clsx('tw-overflow-hidden', className)}>
                    {!showCode ? (
                        // When code shouldn't be show, display a placeholder
                        <CodeBlockPlaceholder text={code} />
                    ) : (
                        // Otherwise show the actual code with syntax highlighting
                        <pre className={styles.content}>{children}</pre>
                    )}

                    {/* Actions bar */}
                    <div className={styles.buttonsContainer}>
                        <div className={styles.buttons}>
                            {actionButtons}
                            <div className={styles.metadataContainer}>{guardrailsStatus}</div>
                        </div>
                    </div>
                </div>
            )}
        </GuardrailsApplicator>
    )
}
