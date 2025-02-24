import { clsx } from 'clsx'
import { LRUCache } from 'lru-cache'
import { LoaderIcon, PlusIcon } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { type Guardrails, type PromptString, isError } from '@sourcegraph/cody-shared'

import type { FixupTaskID } from '../../../src/non-stop/FixupTask'
import { CodyTaskState } from '../../../src/non-stop/state'
import { type ClientActionListener, useClientActionListener } from '../../client/clientState'
import { MarkdownFromCody } from '../../components/MarkdownFromCody'
import { useConfig } from '../../utils/useConfig'
import type { PriorHumanMessageInfo } from '../cells/messageCell/assistant/AssistantMessageCell'
import styles from './ChatMessageContent.module.css'
import { GuardrailsStatusController } from './GuardRailStatusController'
import { createButtons, createButtonsExperimentalUI } from './create-buttons'
import { extractThinkContent, getCodeBlockId, getFileName } from './utils'

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
                // Check if the code element has either 'language-bash' or 'language-shell' class
                const isShellCommand =
                    codeElement?.classList.contains('language-bash') ||
                    codeElement?.classList.contains('language-shell')
                const codeBlockName = isShellCommand ? 'command' : fileName

                let buttons: HTMLElement

                if (smartApplyEnabled) {
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
                        smartApplyState
                    )
                } else {
                    buttons = createButtons(
                        preText,
                        copyButtonOnSubmit,
                        config.config.hasEditCapability ? insertButtonOnSubmit : undefined
                    )
                }

                const metadataContainer = document.createElement('div')
                metadataContainer.classList.add(styles.metadataContainer)
                buttons.append(metadataContainer)

                if (guardrails) {
                    const container = document.createElement('div')
                    container.classList.add(styles.attributionContainer)
                    metadataContainer.append(container)

                    if (!isMessageLoading) {
                        const g = new GuardrailsStatusController(container)
                        g.setPending()

                        guardrails
                            .searchAttribution(preText)
                            .then(attribution => {
                                if (isError(attribution)) {
                                    g.setUnavailable(attribution)
                                } else if (attribution.repositories.length === 0) {
                                    g.setSuccess()
                                } else {
                                    g.setFailure(
                                        attribution.repositories.map(r => r.name),
                                        attribution.limitHit
                                    )
                                }
                            })
                            .catch(error => {
                                g.setUnavailable(error)
                                return
                            })
                    }
                }

                if (fileName) {
                    const fileNameContainer = document.createElement('div')
                    fileNameContainer.className = styles.fileNameContainer
                    fileNameContainer.textContent = getFileName(fileName)
                    fileNameContainer.title = fileName
                    metadataContainer.append(fileNameContainer)
                }

                // Insert the buttons after the pre using insertBefore() because there is no insertAfter()
                preElement.parentNode.insertBefore(buttons, preElement.nextSibling)
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

    return (
        <div ref={rootRef} data-testid="chat-message-content">
            {thinkContent.length > 0 && (
                <details
                    open
                    className="tw-container tw-mb-7 tw-border tw-border-gray-500/20 dark:tw-border-gray-600/40 tw-rounded-lg tw-overflow-hidden tw-backdrop-blur-sm hover:tw-bg-gray-200/50 dark:hover:tw-bg-gray-700/50"
                    title="Thinking & Reasoning Space"
                >
                    <summary
                        className={clsx(
                            'tw-flex tw-items-center tw-gap-2 tw-px-3 tw-py-2 tw-bg-gray-100/50 dark:tw-bg-gray-800/80 tw-cursor-pointer tw-select-none tw-transition-colors',
                            {
                                'tw-animate-pulse': isThinking,
                            }
                        )}
                    >
                        {isThinking ? (
                            <LoaderIcon size={16} className="tw-animate-spin tw-text-muted-foreground" />
                        ) : (
                            <PlusIcon size={16} className="tw-text-muted-foreground" />
                        )}
                        <span className="tw-font-medium tw-text-gray-600 dark:tw-text-gray-300">
                            {isThinking ? 'Thinking...' : 'Thought Process'}
                        </span>
                    </summary>
                    <div className="tw-px-4 tw-py-3 tw-mx-4 tw-text-sm tw-prose dark:tw-prose-invert tw-max-w-none tw-leading-relaxed tw-text-base/7 tw-text-muted-foreground">
                        {thinkContent}
                    </div>
                </details>
            )}
            <MarkdownFromCody className={clsx(styles.content, className)}>
                {displayContent}
            </MarkdownFromCody>
        </div>
    )
}
