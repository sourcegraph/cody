import { clsx } from 'clsx'
import { LRUCache } from 'lru-cache'
import { LoaderIcon, MinusIcon, PlusIcon } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Guardrails, PromptString } from '@sourcegraph/cody-shared'

import type { FixupTaskID } from '../../../src/non-stop/FixupTask'
import { CodyTaskState } from '../../../src/non-stop/state'
import { type ClientActionListener, useClientActionListener } from '../../client/clientState'
import { MarkdownFromCody } from '../../components/MarkdownFromCody'
import { useConfig } from '../../utils/useConfig'
import type { PriorHumanMessageInfo } from '../cells/messageCell/assistant/AssistantMessageCell'
import styles from './ChatMessageContent.module.css'
import { createButtons, createButtonsExperimentalUI } from './create-buttons'
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

    guardrails?: Guardrails
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
}) => {
    const rootRef = useRef<HTMLDivElement>(null)
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

    useClientActionListener(
        // Always subscribe but listen only smart apply result events
        { isActive: true, selector: event => !!event.smartApplyResult },
        useCallback<ClientActionListener>(({ smartApplyResult }) => {
            if (smartApplyResult) {
                setSmartApplyStates(prev => ({
                    ...prev,
                    [smartApplyResult.taskId]: smartApplyResult.taskState,
                }))
            }
        }, [])
    )

    // See SRCH-942: this `useEffect` is very large and any update to the
    // dependencies triggers a network request to our guardrails server. Be very
    // careful about adding more dependencies.  Ideally, we should refactor this
    // `useEffect` into smaller blocks with more narrow dependencies.
    // biome-ignore lint/correctness/useExhaustiveDependencies: needs to run when `displayMarkdown` changes or else the buttons won't show up.
    useEffect(() => {
        if (!rootRef.current) {
            return
        }

        const preElements = rootRef.current.querySelectorAll('pre')
        if (!preElements?.length || !copyButtonOnSubmit) {
            return
        }

        const existingButtons = rootRef.current.querySelectorAll(`.${styles.buttonsContainer}`)
        for (const existingButton of existingButtons) {
            existingButton.remove()
        }

        for (const preElement of preElements) {
            const preText = preElement.textContent

            if (preText?.trim() && preElement.parentNode) {
                // Extract the <code> element and attached `data-file-path` if present.
                // This allows us to intelligently apply code to the suitable file.
                const codeElement = preElement.querySelectorAll('code')?.[0]
                const fileName = codeElement?.getAttribute('data-file-path') || undefined
                const toolName = codeElement?.getAttribute('tool-name') || undefined
                // Check if the code element has either 'language-bash' or 'language-shell' class
                const isShellCommand = codeElement?.classList.contains('language-bash')
                const codeBlockName = isShellCommand ? 'command' : fileName

                let buttons: HTMLElement

                // Smart apply is available only for code blocks with a file name.
                if (smartApplyEnabled && fileName && !toolName) {
                    const smartApplyId = getCodeBlockId(preText, fileName)
                    const smartApplyState = smartApplyStates[smartApplyId]

                    // Since we iterate over `<pre>` elements, we're already inside a code block.
                    // When we start rendering text outside the code block—meaning new characters
                    // appear after the closing backticks—we should prefetch the smart apply response.
                    //
                    // To avoid redundant prefetching, we track processed code blocks in `prefetchedEdits`.
                    const areWeAlreadyOutsideTheCodeBlock = !displayMarkdown.endsWith('```')

                    // Side-effect: prefetch smart apply data if possible to reduce the final latency.
                    // TODO: use a better heuristic to determine if the code block is complete.
                    // TODO: extract this call into a separate `useEffect` call to avoid redundant calls
                    // which currently happen.
                    if (
                        codeBlockName !== 'command' &&
                        (!isMessageLoading || areWeAlreadyOutsideTheCodeBlock) &&
                        // Ensure that we prefetch once per each suggested code block.
                        !prefetchedEdits.has(smartApplyId)
                    ) {
                        prefetchedEdits.set(smartApplyId, true)

                        smartApply?.onSubmit({
                            id: smartApplyId,
                            text: preText,
                            isPrefetch: true,
                            instruction: humanMessage?.text,
                            fileName: codeBlockName,
                        })
                    }

                    buttons = createButtonsExperimentalUI(
                        preText,
                        humanMessage,
                        config,
                        codeBlockName,
                        copyButtonOnSubmit,
                        config.config.hasEditCapability ? insertButtonOnSubmit : undefined,
                        smartApplyInterceptor,
                        smartApplyId,
                        smartApplyState,
                        guardrails,
                        isMessageLoading
                    )
                } else {
                    buttons = createButtons(
                        preText,
                        copyButtonOnSubmit,
                        config.config.hasEditCapability ? insertButtonOnSubmit : undefined
                    )
                }

                const parent = preElement.parentNode
                if (!parent) return

                // Get the preview container and actions container
                const previewContainer = buttons.querySelector(`[data-container-type="preview"]`)
                const actionsContainer = buttons.querySelector(`[data-container-type="actions"]`)
                if (!previewContainer || !actionsContainer) return

                // Insert the preview container right before this code block
                parent.insertBefore(previewContainer, preElement)

                // Add the actions container right after this code block
                if (preElement.nextSibling) {
                    parent.insertBefore(actionsContainer, preElement.nextSibling)
                } else {
                    parent.appendChild(actionsContainer)
                }
            }
        }
    }, [
        copyButtonOnSubmit,
        insertButtonOnSubmit,
        smartApplyEnabled,
        guardrails,
        displayMarkdown,
        isMessageLoading,
        humanMessage,
        smartApplyInterceptor,
        smartApplyStates,
    ])

    const { displayContent, thinkContent, isThinking } = useMemo(
        () => extractThinkContent(displayMarkdown),
        [displayMarkdown]
    )

    const [isOpen, setIsOpen] = useState(true)

    return (
        <div ref={rootRef} data-testid="chat-message-content">
            {thinkContent.length > 0 && (
                <details
                    open={isOpen}
                    onToggle={e => setIsOpen((e.target as HTMLDetailsElement).open)}
                    className="tw-container tw-mb-4 tw-border tw-border-gray-500/20 dark:tw-border-gray-600/40 tw-rounded-lg tw-overflow-hidden tw-backdrop-blur-sm"
                    title="Thinking & Reasoning Space"
                >
                    <summary
                        className={clsx(
                            'tw-flex tw-items-center tw-gap-2 tw-px-3 tw-py-2 tw-bg-transparent dark:tw-bg-transparent tw-cursor-pointer tw-select-none tw-transition-colors',
                            {
                                'tw-animate-pulse': isThinking,
                            }
                        )}
                    >
                        {isThinking ? (
                            <LoaderIcon size={16} className="tw-animate-spin tw-text-foreground/80" />
                        ) : (
                            <>
                                {isOpen ? (
                                    <MinusIcon size={16} className="tw-text-foreground/80" />
                                ) : (
                                    <PlusIcon size={16} className="tw-text-foreground/80" />
                                )}
                            </>
                        )}
                        <span className="tw-font-semibold tw-text-foreground/80">
                            {isThinking ? 'Thinking...' : 'Thought Process'}
                        </span>
                    </summary>
                    <div className="tw-px-4 tw-py-3 tw-mx-4 tw-text-sm tw-prose dark:tw-prose-invert tw-max-w-none tw-leading-relaxed tw-text-base/7">
                        <MarkdownFromCody className={clsx(styles.content, className)}>
                            {thinkContent}
                        </MarkdownFromCody>
                    </div>
                </details>
            )}
            <MarkdownFromCody className={clsx(styles.content, className)}>
                {displayContent}
            </MarkdownFromCody>
        </div>
    )
}
