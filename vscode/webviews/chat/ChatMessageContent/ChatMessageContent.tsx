import { type Guardrails, type PromptString, isError } from '@sourcegraph/cody-shared'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

/**
 * A component presenting the content of a chat message.
 */
export const ChatMessageContent: FC<ChatMessageContentProps> = ({
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

    /**
     * Listens for client actions and updates the smart apply states accordingly.
     */
    useClientActionListener(
        useCallback<ClientActionListener>(({ smartApplyResult }) => {
            if (smartApplyResult) {
                setSmartApplyStates(prev => ({
                    ...prev,
                    [smartApplyResult.taskId]: smartApplyResult.taskState,
                }))
            }
        }, [])
    )

    /**
     * Creates buttons for a code block based on the current configuration and state.
     * @param preText - The text content of the code block.
     * @param fileName - The name of the file associated with the code block, if any.
     * @param isShellCommand - Indicates whether the code block is a shell command.
     * @returns An HTMLElement containing the appropriate buttons for the code block.
     */
    const createButtonsForCodeBlock = useCallback(
        (preText: string, fileName: string | undefined, isShellCommand: boolean) => {
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
                    insertButtonOnSubmit,
                    smartApplyInterceptor,
                    smartApplyId,
                    smartApplyState
                )
            } else {
                buttons = createButtons(preText, copyButtonOnSubmit, insertButtonOnSubmit)
            }

            return buttons
        },
        [
            smartApplyEnabled,
            smartApplyStates,
            humanMessage,
            config,
            copyButtonOnSubmit,
            insertButtonOnSubmit,
            smartApplyInterceptor,
        ]
    )

    /**
     * Handles guardrails for code attribution.
     * @param container - The HTML element to display the guardrails status.
     * @param preText - The text content of the code block to check for attribution.
     */
    const handleGuardrails = useCallback(
        (container: HTMLElement, preText: string) => {
            if (!guardrails || isMessageLoading) return

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
                })
        },
        [guardrails, isMessageLoading]
    )

    /**
     * Creates a DOM element to display a file name.
     * @param fileName - The full file path or name to display.
     * @returns A div element containing the formatted file name.
     */
    const createFileNameElement = useCallback((fileName: string) => {
        const fileNameContainer = document.createElement('div')
        fileNameContainer.className = styles.fileNameContainer
        fileNameContainer.textContent = getFileName(fileName)
        fileNameContainer.title = fileName
        return fileNameContainer
    }, [])

    /**
     * Processes code blocks in the message content.
     * Adds copy/insert buttons, file names, and guardrails to each code block.
     * Removes existing buttons before adding new ones.
     */
    const processCodeBlocks = useCallback(() => {
        if (!rootRef.current || !copyButtonOnSubmit) return

        const preElements = rootRef.current.querySelectorAll('pre')
        if (!preElements?.length) return

        // Remove existing buttons
        const existingButtons = rootRef.current.querySelectorAll(`.${styles.buttonsContainer}`)
        for (const button of existingButtons) {
            button.remove()
        }

        for (const preElement of preElements) {
            const preText = preElement.textContent
            if (!preText?.trim() || !preElement.parentNode) continue

            const codeElement = preElement.querySelector('code')
            const fileName = codeElement?.getAttribute('data-file-path') ?? undefined
            const isShellCommand =
                codeElement?.classList.contains('language-bash') ||
                codeElement?.classList.contains('language-shell')

            const buttons = createButtonsForCodeBlock(preText, fileName, isShellCommand ?? false)

            const metadataContainer = document.createElement('div')
            metadataContainer.classList.add(styles.metadataContainer)
            buttons.append(metadataContainer)

            if (guardrails) {
                const container = document.createElement('div')
                container.classList.add(styles.attributionContainer)
                metadataContainer.append(container)
                handleGuardrails(container, preText)
            }

            if (fileName) {
                metadataContainer.append(createFileNameElement(fileName))
            }

            preElement.parentNode.insertBefore(buttons, preElement.nextSibling)
        }
    }, [
        copyButtonOnSubmit,
        createButtonsForCodeBlock,
        handleGuardrails,
        createFileNameElement,
        guardrails,
    ])

    useEffect(() => {
        processCodeBlocks()
    }, [processCodeBlocks])

    return (
        <div ref={rootRef} data-testid="chat-message-content">
            <MarkdownFromCody className={clsx(styles.content, className)}>
                {displayMarkdown}
            </MarkdownFromCody>
        </div>
    )
}
