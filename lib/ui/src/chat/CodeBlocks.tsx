import React, { useEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'

import { renderCodyMarkdown } from '@sourcegraph/cody-shared'

import { CodeBlockActionsProps } from '../Chat'
import {
    CheckCodeBlockIcon,
    CopyCodeBlockIcon,
    InsertCodeBlockIcon,
    SaveCodeBlockIcon,
} from '../icons/CodeBlockActionIcons'

import styles from './CodeBlocks.module.css'

interface CodeBlocksProps {
    displayText: string

    copyButtonClassName?: string
    insertButtonClassName?: string

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
}

function createButtons(
    text: string,
    copyButtonClassName?: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
    insertButtonClassName?: string,
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
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
        copyButtonClassName
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
                insertButtonClassName
            )
        )

        buttons.append(
            createCodeBlockActionButton(
                'new',
                text,
                'Save Code to New File...',
                SaveCodeBlockIcon,
                codeBlockActions,
                insertButtonClassName
            )
        )
    }

    container.append(buttons)

    return container
}

/**
 * Creates a button to perform an action on a code block.
 *
 * @param type - The type of action button: 'copy', 'insert', or 'new'.
 * @param text - The text content of the code block.
 * @param title - The title attribute for the button.
 * @param iconSvg - The SVG icon to display in the button.
 * @param codeBlockActions - The callback actions to perform on click.
 * @param className - Optional additional CSS class names for the button.
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
    className?: string
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
            codeBlockActions.copy(text, 'Button')
            setTimeout(() => (button.innerHTML = iconSvg), 5000)
        })
    }

    const insertOnSubmit = codeBlockActions.insert
    if (!insertOnSubmit) {
        return button
    }

    switch (type) {
        case 'insert':
            button.addEventListener('click', () => {
                button.innerHTML = CheckCodeBlockIcon
                insertOnSubmit(text, false)
                setTimeout(() => (button.innerHTML = iconSvg), 5000)
            })
            break
        case 'new':
            button.addEventListener('click', () => {
                button.innerHTML = CheckCodeBlockIcon
                insertOnSubmit(text, true)
                setTimeout(() => (button.innerHTML = iconSvg), 5000)
            })
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
}) {
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const preElements = rootRef.current?.querySelectorAll('pre')
        if (!preElements?.length) {
            return
        }

        for (const preElement of preElements) {
            const preText = preElement.textContent
            if (preText?.trim() && preElement.parentNode) {
                const buttons = createButtons(
                    preText,
                    copyButtonClassName,
                    copyButtonOnSubmit,
                    insertButtonClassName,
                    insertButtonOnSubmit
                )

                // Insert the buttons after the pre using insertBefore() because there is no insertAfter()
                preElement.parentNode.insertBefore(buttons, preElement.nextSibling)

                // capture copy events (right click or keydown) on code block
                preElement.addEventListener('copy', () => {
                    if (copyButtonOnSubmit) {
                        copyButtonOnSubmit(preText, 'Keydown')
                    }
                })
            }
        }
    }, [displayText, copyButtonClassName, insertButtonClassName, rootRef, copyButtonOnSubmit, insertButtonOnSubmit])

    return useMemo(
        () => <div ref={rootRef} dangerouslySetInnerHTML={{ __html: renderCodyMarkdown(displayText) }} />,
        [displayText]
    )
})
