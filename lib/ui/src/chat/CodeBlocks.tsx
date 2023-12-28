import React, { useEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'

import { Guardrails, renderCodyMarkdown } from '@sourcegraph/cody-shared'

import { CodeBlockActionsProps } from '../Chat'
import {
    CheckCodeBlockIcon,
    CopyCodeBlockIcon,
    InsertCodeBlockIcon,
    SaveCodeBlockIcon,
    ShieldIcon,
} from '../icons/CodeBlockActionIcons'

import styles from './CodeBlocks.module.css'

interface CodeBlocksProps {
    inProgress: boolean

    displayText: string

    copyButtonClassName?: string
    insertButtonClassName?: string

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    metadata?: CodeBlockMeta

    guardrails?: Guardrails
}

export interface CodeBlockMeta {
    source?: string // the name of the executed command that generated the code
    requestID?: string // id of the request that generated the code
}

function createButtons(
    text: string,
    copyButtonClassName?: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
    insertButtonClassName?: string,
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit'],
    metadata?: CodeBlockMeta
): HTMLElement {
    const container = document.createElement('div')
    container.className = styles.container
    if (!copyButtonOnSubmit) {
        return container
    }

    // The container will contain the buttons and the <pre> element with the code.
    // This allows us to position the buttons independent of the code.
    const buttons = document.createElement('div')
    buttons.className = styles.buttons

    const codeBlockActions = {
        copy: copyButtonOnSubmit,
        insert: insertButtonOnSubmit,
    }

    const copyButton = createCodeBlockActionButton(
        'copy',
        text,
        'Copy Code',
        CopyCodeBlockIcon,
        codeBlockActions,
        copyButtonClassName,
        metadata
    )
    buttons.append(copyButton)

    // The insert buttons only exists for IDE integrations
    if (insertButtonOnSubmit) {
        buttons.append(
            createCodeBlockActionButton(
                'insert',
                text,
                'Insert Code at Cursor',
                InsertCodeBlockIcon,
                codeBlockActions,
                insertButtonClassName,
                metadata
            )
        )

        buttons.append(
            createCodeBlockActionButton(
                'new',
                text,
                'Save Code to New File...',
                SaveCodeBlockIcon,
                codeBlockActions,
                insertButtonClassName,
                metadata
            )
        )
    }

    container.append(buttons)

    return container
}

/**
 * Creates a button to perform an action on a code block.
 * @returns The button element.
 */
function createCodeBlockActionButton(
    type: 'copy' | 'insert' | 'new',
    text: string,
    title: string,
    iconSvg: string,
    codeBlockActions: {
        copy: CodeBlockActionsProps['copyButtonOnSubmit']
        insert?: CodeBlockActionsProps['insertButtonOnSubmit']
    },
    className?: string,
    metadata?: CodeBlockMeta
): HTMLElement {
    const button = document.createElement('button')

    const styleClass = type === 'copy' ? styles.copyButton : styles.insertButton

    button.innerHTML = iconSvg
    button.title = title
    button.className = classNames(styleClass, className)

    if (type === 'copy') {
        button.addEventListener('click', () => {
            button.innerHTML = CheckCodeBlockIcon
            navigator.clipboard.writeText(text).catch(error => console.error(error))
            button.className = classNames(styleClass, className)
            codeBlockActions.copy(text, 'Button', metadata)
            setTimeout(() => (button.innerHTML = iconSvg), 5000)
        })
    }

    const insertOnSubmit = codeBlockActions.insert
    if (!insertOnSubmit) {
        return button
    }

    switch (type) {
        case 'insert':
            button.addEventListener('click', () => insertOnSubmit(text, false, metadata))
            break
        case 'new':
            button.addEventListener('click', () => insertOnSubmit(text, true, metadata))
            break
    }

    return button
}

export const CodeBlocks: React.FunctionComponent<CodeBlocksProps> = React.memo(function CodeBlocksContent({
    displayText,
    copyButtonClassName,
    copyButtonOnSubmit,
    insertButtonClassName,
    insertButtonOnSubmit,
    metadata,
    inProgress,
    guardrails,
}) {
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Attach code block actions only when the message is completed
        if (inProgress) {
            return
        }

        const preElements = rootRef.current?.querySelectorAll('pre')
        if (!preElements?.length || !copyButtonOnSubmit) {
            return
        }

        for (const preElement of preElements) {
            const preText = preElement.textContent
            if (preText?.trim() && preElement.parentNode) {
                const eventMetadata = { requestID: metadata?.requestID, source: metadata?.source }
                const buttons = createButtons(
                    preText,
                    copyButtonClassName,
                    copyButtonOnSubmit,
                    insertButtonClassName,
                    insertButtonOnSubmit,
                    eventMetadata
                )
                if (guardrails) {
                    const flexFiller = document.createElement('div')
                    flexFiller.classList.add(styles.flexFiller)
                    buttons.append(flexFiller)
                    const attributionContainer = document.createElement('div')
                    attributionContainer.innerHTML = ShieldIcon
                    attributionContainer.classList.add(styles.attributionIcon)
                    attributionContainer.title = 'Attribution search running...'
                    buttons.append(attributionContainer)

                    guardrails
                        .searchAttribution(preText)
                        .then(attribution => {
                            if (attribution instanceof Error || attribution.limitHit) {
                                attributionContainer.classList.add(styles.attributionIconUnavailable)
                                attributionContainer.title = 'Attribution search unavailable.'
                                return
                            }
                            if (attribution.repositories.length > 0) {
                                attributionContainer.classList.add(styles.attributionIconFound)
                                let tooltip = `Attribution found in ${attribution.repositories[0].name}`
                                if (attribution.repositories.length > 1) {
                                    tooltip = `${tooltip} and ${attribution.repositories.length - 1} more.`
                                } else {
                                    tooltip = `${tooltip}.`
                                }
                                attributionContainer.title = tooltip
                                return
                            }
                            attributionContainer.classList.add(styles.attributionIconNotFound)
                            attributionContainer.title = 'Attribution not found.'
                        })
                        .catch(error => {
                            console.error('promise failed', error)
                        })
                }

                // Insert the buttons after the pre using insertBefore() because there is no insertAfter()
                preElement.parentNode.insertBefore(buttons, preElement.nextSibling)

                // capture copy events (right click or keydown) on code block
                preElement.addEventListener('copy', () => {
                    if (copyButtonOnSubmit) {
                        copyButtonOnSubmit(preText, 'Keydown', eventMetadata)
                    }
                })
            }
        }
    }, [
        displayText,
        copyButtonClassName,
        insertButtonClassName,
        rootRef,
        copyButtonOnSubmit,
        insertButtonOnSubmit,
        metadata?.requestID,
        metadata?.source,
        inProgress,
        guardrails,
    ])

    return useMemo(
        () => <div ref={rootRef} dangerouslySetInnerHTML={{ __html: renderCodyMarkdown(displayText) }} />,
        [displayText]
    )
})
