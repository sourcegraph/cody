import { type Guardrails, type PromptString, isError } from '@sourcegraph/cody-shared'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { clsx } from 'clsx'
import { CodyTaskState } from '../../../src/non-stop/state'
import { type ClientActionListener, useClientActionListener } from '../../client/clientState'
import { MarkdownFromCody } from '../../components/MarkdownFromCody'
import styles from './ChatMessageContent.module.css'
import type { PriorHumanMessageInfo } from '../cells/messageCell/assistant/AssistantMessageCell'
import { createButtons, createButtonsExperimentalUI } from './create-buttons'
import { GuardrailsStatusController } from './GuardRailStatusController'
import { getCodeBlockId } from './utils'
import type { FixupTaskID } from '../../../src/non-stop/FixupTask'

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

    experimentalSmartApplyEnabled?: boolean
    smartApply?: CodeBlockActionsProps['smartApply']

    guardrails?: Guardrails
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
    experimentalSmartApplyEnabled,
    smartApply,
}) => {
    const rootRef = useRef<HTMLDivElement>(null)

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
        useCallback<ClientActionListener>(({ smartApplyResult }) => {
            if (smartApplyResult) {
                setSmartApplyStates(prev => ({
                    ...prev,
                    [smartApplyResult.taskId]: smartApplyResult.taskState,
                }))
            }
        }, [])
    )

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
                let buttons: HTMLElement

                if (experimentalSmartApplyEnabled) {
                    const smartApplyId = getCodeBlockId(preText, fileName)
                    const smartApplyState = smartApplyStates[smartApplyId]
                    buttons = createButtonsExperimentalUI(
                        preText,
                        humanMessage,
                        fileName,
                        copyButtonOnSubmit,
                        smartApplyInterceptor,
                        smartApplyId,
                        smartApplyState
                    )
                } else {
                    buttons = createButtons(preText, copyButtonOnSubmit, insertButtonOnSubmit)
                }

                if (guardrails) {
                    const container = document.createElement('div')
                    container.classList.add(styles.attributionContainer)
                    buttons.append(container)

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

                // Insert the buttons after the pre using insertBefore() because there is no insertAfter()
                preElement.parentNode.insertBefore(buttons, preElement.nextSibling)
            }
        }
    }, [
        copyButtonOnSubmit,
        insertButtonOnSubmit,
        experimentalSmartApplyEnabled,
        smartApplyInterceptor,
        guardrails,
        displayMarkdown,
        isMessageLoading,
        humanMessage,
        smartApplyInterceptor,
        smartApplyStates,
    ])

    return (
        <div ref={rootRef} data-testid="chat-message-content">
            <MarkdownFromCody className={clsx(styles.content, className)}>
                {displayMarkdown}
            </MarkdownFromCody>
        </div>
    )
}
