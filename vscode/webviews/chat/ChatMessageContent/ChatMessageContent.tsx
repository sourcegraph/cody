import { type Guardrails, type PromptString, isError } from '@sourcegraph/cody-shared'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { clsx } from 'clsx'
import type { FixupTaskID } from '../../../src/non-stop/FixupTask'
import { CodyTaskState } from '../../../src/non-stop/state'
import { type ClientActionListener, useClientActionListener } from '../../client/clientState'
import { MarkdownFromCody } from '../../components/MarkdownFromCody'
import { useConfig } from '../../utils/useConfig'
import type { PriorHumanMessageInfo } from '../cells/messageCell/assistant/AssistantMessageCell'
import styles from './ChatMessageContent.module.css'
import { GuardrailsStatusController } from './GuardRailStatusController'
import { createButtons, createButtonsExperimentalUI } from './create-buttons'
import { getCodeBlockId, getFileName } from './utils'

export interface CodeBlockActionsProps {
    copyButtonOnSubmit: (text: string, event?: 'Keydown' | 'Button') => void
    insertButtonOnSubmit: (text: string, newFile?: boolean) => void
    smartApply: {
        onSubmit: (id: string, text: string, instruction?: PromptString, fileName?: string) => void
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

interface StreamingContent {
    displayContent: string
    thinkContent: string
    hasThinkTag: boolean
    isThinking: boolean
}

const extractThinkContent = (content: string): StreamingContent => {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g
    const thinkMatches = [...content.matchAll(thinkRegex)]

    // Check if content has an unclosed think tag
    const hasOpenThinkTag =
        content.includes('<think>') && content.lastIndexOf('<think>') > content.lastIndexOf('</think>')

    // Collect all think content, including partial content from unclosed tag
    let thinkContent = thinkMatches
        .map(match => match[1].trim())
        .filter(Boolean)
        .join('\n\n')

    if (hasOpenThinkTag) {
        const lastThinkContent = content.slice(content.lastIndexOf('<think>') + 7)
        thinkContent = thinkContent ? `${thinkContent}\n\n${lastThinkContent}` : lastThinkContent
    }

    // Remove complete think tags from display content
    let displayContent = content.replace(thinkRegex, '')
    // Remove any unclosed think tag and its content
    if (hasOpenThinkTag) {
        displayContent = displayContent.slice(0, displayContent.lastIndexOf('<think>'))
    }

    return {
        displayContent,
        thinkContent,
        hasThinkTag: thinkMatches.length > 0 || hasOpenThinkTag,
        isThinking: hasOpenThinkTag,
    }
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
            onSubmit(id, text, instruction, fileName) {
                // We intercept the `onSubmit` to mark this task as working as early as we can.
                // In reality, this will happen once we determine the task selection and _then_ start the task.
                // The user does not need to be aware of this, for their purposes this is a single operation.
                // We can re-use the `Working` state to simplify our UI logic.
                setSmartApplyStates(prev => ({ ...prev, [id]: CodyTaskState.Working }))
                return smartApply.onSubmit(id, text, instruction, fileName)
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

    const { displayContent, thinkContent, hasThinkTag, isThinking } = useMemo(
        () => extractThinkContent(displayMarkdown),
        [displayMarkdown]
    )

    return (
        <div ref={rootRef} data-testid="chat-message-content">
            {hasThinkTag && (
                <details open className={styles.thinkContainer}>
                    <summary className={styles.thinkSummary}>
                        <div className={styles.thinkTitleContainer}>
                            <div className={styles.thinkIconContainer}>
                                <svg
                                    className={clsx(styles.thinkIcon, isThinking && styles.thinking)}
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    role="img"
                                    aria-label="Thinking indicator"
                                >
                                    <title>Thinking indicator</title>
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"
                                    />
                                </svg>
                            </div>
                            <span className={styles.thinkTitle}>
                                {isThinking ? 'Thinking...' : 'Thought Process'}
                            </span>
                        </div>
                        <div className={styles.thinkToggleContainer}>
                            <div className={styles.thinkToggleButton}>
                                <svg
                                    className={styles.thinkToggleIcon}
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    role="img"
                                    aria-label="Toggle thought process"
                                >
                                    <title>Toggle thought process</title>
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M19 9l-7 7-7-7"
                                    />
                                </svg>
                            </div>
                        </div>
                    </summary>
                    <div className={styles.thinkContent}>
                        <MarkdownFromCody className={styles.thinkMarkdown}>
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
