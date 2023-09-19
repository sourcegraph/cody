import React, { useEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'

import { renderCodyMarkdown } from '@sourcegraph/cody-shared'

import { CopyButtonProps } from '../Chat'

import styles from './CodeBlocks.module.css'

interface CodeBlocksProps {
    displayText: string

    copyButtonClassName?: string
    insertButtonClassName?: string

    copyButtonOnSubmit?: CopyButtonProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CopyButtonProps['insertButtonOnSubmit']
}

function wrapElement(element: HTMLElement, wrapperElement: HTMLElement): void {
    if (!element.parentNode) {
        return
    }
    element.parentNode.insertBefore(wrapperElement, element)
    wrapperElement.append(element)
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

    // The container will contain the buttons and the <pre> element with the code.
    // This allows us to position the buttons independent of the code.
    const buttons = document.createElement('div')
    buttons.className = styles.buttons

    const copyButton = createCopyButton(text, copyButtonClassName, copyButtonOnSubmit)
    const insertButton = createInsertButton(text, container, insertButtonClassName, insertButtonOnSubmit)
    const insertNewButton = createInsertNewFileButton(text, insertButtonClassName, insertButtonOnSubmit)
    // The insert buttons only exists for IDE integrations
    if (insertButton) {
        buttons.append(insertButton)
    }
    if (insertNewButton) {
        buttons.append(insertNewButton)
    }
    buttons.append(copyButton)

    container.append(buttons)

    return container
}

function createCopyButton(
    text: string,
    className?: string,
    copyButtonOnSubmit?: CopyButtonProps['copyButtonOnSubmit']
): HTMLElement {
    const button = document.createElement('button')
    button.textContent = 'Copy'
    button.title = 'Copy text'
    button.className = classNames(styles.copyButton, className)
    button.addEventListener('click', () => {
        navigator.clipboard.writeText(text).catch(error => console.error(error))
        button.textContent = 'Copied'
        setTimeout(() => (button.textContent = 'Copy'), 3000)
        if (copyButtonOnSubmit) {
            copyButtonOnSubmit(text, 'Button')
        }
    })
    return button
}

function createInsertButton(
    text: string,
    container: HTMLElement,
    className?: string,
    insertButtonOnSubmit?: CopyButtonProps['insertButtonOnSubmit']
): HTMLElement | null {
    if (!className || !insertButtonOnSubmit) {
        return null
    }
    const button = document.createElement('button')
    button.textContent = 'Insert at Cursor'
    button.title = 'Insert text at current cursor position'
    button.className = classNames(styles.insertButton, className)
    button.addEventListener('click', () => {
        insertButtonOnSubmit(text, false)
    })
    return button
}

function createInsertNewFileButton(
    text: string,
    className?: string,
    insertButtonOnSubmit?: CopyButtonProps['insertButtonOnSubmit']
): HTMLElement | null {
    if (!className || !insertButtonOnSubmit) {
        return null
    }

    const button = document.createElement('button')
    button.textContent = 'Insert to File'
    button.title = 'Insert code to the end of an exisiting or new file'
    button.className = classNames(styles.insertButton, className)
    button.addEventListener('click', () => {
        insertButtonOnSubmit(text, true)
    })
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
                wrapElement(
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
