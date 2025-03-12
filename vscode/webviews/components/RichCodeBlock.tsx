import type { Guardrails } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { LRUCache } from 'lru-cache'
import { FileIcon, PlusIcon } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CodyTaskState } from '../../src/non-stop/state'
import type { CodeBlockActionsProps } from '../chat/ChatMessageContent/ChatMessageContent'
import styles from '../chat/ChatMessageContent/ChatMessageContent.module.css'
import { createEditButtons, createExecuteButton } from '../chat/ChatMessageContent/EditButtons'
import { getCodeBlockId } from '../chat/ChatMessageContent/utils'
import { type ClientActionListener, useClientActionListener } from '../client/clientState'
import { CodeBlockPlaceholder } from './CodeBlockPlaceholder'
import { GuardrailsApplicator } from './GuardrailsManager'

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
    // Smart apply is only applicable if the code is complete. These properties
    // will be stable (undefined) until the code is complete, skipping any
    // updates caused by incomplete code as it is streamed.
    const smartApplyCode = smartApply && isCodeComplete && !isShellCommand ? code : undefined
    console.log(
        'RichCodeBlock: smartApplyCode',
        smartApplyCode,
        'smartApply',
        smartApply,
        'complete?',
        isCodeComplete,
        'shell?',
        isShellCommand,
        'code',
        code.slice(0, 10),
        code.length
    )
    const smartApplyFilename = smartApply && isCodeComplete && !isShellCommand ? fileName : undefined
    const thisTaskId = useMemo(() => {
        if (!smartApplyCode) {
            console.log('thisTaskId: no smartApplyCode')
            return undefined
        }
        const codeBlockId = getCodeBlockId(smartApplyCode, smartApplyFilename)
        console.log('thisTaskId', codeBlockId)
        return codeBlockId
    }, [smartApplyCode, smartApplyFilename])

    // TODO: Add a retry button with refreshcwicon from lucide icons

    const [smartApplyState, setSmartApplyState] = useState<CodyTaskState | undefined>(undefined)

    // TODO: We can tighten this up by making the properties depend on isCodeComplete etc.
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
            {
                // TODO: hide/disable these until generation is complete
                createEditButtons({
                    hasEditIntent,
                    isVSCode: true, // TODO: Access (or pass) config.config.isVSCode, something like that
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
                })
            }

            {isShellCommand && onExecute && createExecuteButton(code)}

            {!isShellCommand && onInsert && (
                <>
                    <button
                        className={styles.button}
                        type="button"
                        onClick={() => onInsert(code, false)}
                        title="Insert at cursor"
                    >
                        <div className={styles.iconContainer}>
                            <PlusIcon size={14} />
                        </div>
                        <span className="tw-hidden xs:tw-block">Insert</span>
                    </button>

                    <button
                        className={styles.button}
                        type="button"
                        onClick={() => onInsert(code, true)}
                        title="Save to new file"
                    >
                        <div className={styles.iconContainer}>
                            <FileIcon size={14} />
                        </div>
                        <span className="tw-hidden xs:tw-block">Save as</span>
                    </button>
                </>
            )}
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
