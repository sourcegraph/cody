import React, { useEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'

import { renderCodyMarkdown } from '@sourcegraph/cody-shared'

import { CopyButtonProps } from '../Chat'
import { CopyCodeBlockIcon, InsertCodeBlockIcon, SaveCodeBlockIcon } from '../icons/CodeBlockActionIcons'

import styles from './CodeBlocks.module.css'

interface CodeBlocksProps {
    displayText: string

    copyButtonClassName?: string
    insertButtonClassName?: string

    copyButtonOnSubmit?: CopyButtonProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CopyButtonProps['insertButtonOnSubmit']
}

function appendElement(element: HTMLElement, buttonElements: HTMLElement): void {
    if (!element.parentNode) {
        return
    }

    // Insert the buttons to element's parent after the element
    element.parentNode.insertBefore(buttonElements, element.nextSibling)
}

function createButtons(
    text: string,
    copyButtonClassName?: string,
    copyButtonOnSubmit?: CopyButtonProps['copyButtonOnSubmit'],
    insertButtonClassName?: string,
    insertButtonOnSubmit?: CopyButtonProps['insertButtonOnSubmit']
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
        'Copy text',
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
                'Insert code at cursor',
                InsertCodeBlockIcon,
                codeBlockActions,
                insertButtonClassName
            )
        )

        buttons.append(
            createCodeBlockActionButton(
                'new',
                text,
                'Save code to a new file',
                SaveCodeBlockIcon,
                codeBlockActions,
                insertButtonClassName
            )
        )
    }

    container.append(buttons)

    return container
}

function createCodeBlockActionButton(
    type: 'copy' | 'insert' | 'new',
    text: string,
    title: string,
    iconSvg: string,
    codeBlockActions: {
        copy: CopyButtonProps['copyButtonOnSubmit']
        insert?: CopyButtonProps['insertButtonOnSubmit']
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
            navigator.clipboard.writeText(text).catch(error => console.error(error))
            button.className = classNames(styleClass, className)
            codeBlockActions.copy(text, 'Button')
        })
    }

    const insertOnSubmit = codeBlockActions.insert
    if (!insertOnSubmit) {
        return button
    }

    switch (type) {
        case 'insert':
            button.addEventListener('click', () => {
                insertOnSubmit(text, false)
            })
            break
        case 'new':
            button.addEventListener('click', () => {
                insertOnSubmit(text, true)
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
            if (preText?.trim()) {
                // We have to wrap the `<pre>` tag in the button container, otherwise
                // the buttons scroll along with the code.
                appendElement(
                    preElement,
                    createButtons(
                        preText,
                        copyButtonClassName,
                        copyButtonOnSubmit,
                        insertButtonClassName,
                        insertButtonOnSubmit
                    )
                )

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
