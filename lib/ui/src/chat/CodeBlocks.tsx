import React, { RefObject, useEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'

import { renderCodyMarkdown } from '@sourcegraph/cody-shared'

import { CopyButtonProps } from '../Chat'

import styles from './CodeBlocks.module.css'

export type CodyRecipeWidgetWrapper = React.ComponentType<{
    targetRef: RefObject<HTMLElement>
    transcriptRef: RefObject<HTMLElement>
    children: any
}> | null

interface CodeBlocksProps {
    displayText: string

    copyButtonClassName?: string
    insertButtonClassName?: string

    CopyButtonProps?: CopyButtonProps['copyButtonOnSubmit']
    RecipeWidgetWrapper?: CodyRecipeWidgetWrapper
    transcriptRef?: RefObject<HTMLElement>
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
    insertButtonClassName?: string
): HTMLElement {
    const container = document.createElement('div')
    container.className = styles.container

    // The container will contain the buttons and the <pre> element with the code.
    // This allows us to position the buttons independent of the code.
    const buttons = document.createElement('div')
    buttons.className = styles.buttons

    const copyButton = createCopyButton(text, copyButtonClassName, copyButtonOnSubmit)
    const insertButton = createInsertButton(text, container, insertButtonClassName, copyButtonOnSubmit)

    // The insert button only exists for IDE integrations
    if (insertButton) {
        buttons.append(insertButton)
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
            copyButtonOnSubmit('copyButton')
        }
    })
    return button
}

function createInsertButton(
    text: string,
    container: HTMLElement,
    className?: string,
    copyButtonOnSubmit?: CopyButtonProps['copyButtonOnSubmit']
): HTMLElement | null {
    if (!className || !copyButtonOnSubmit) {
        return null
    }
    const button = document.createElement('button')
    button.textContent = 'Insert at Cursor'
    button.title = 'Insert text at current cursor position'
    button.className = classNames(styles.insertButton, className)
    button.addEventListener('click', () => {
        copyButtonOnSubmit(text, true)
    })
    return button
}

export const CodeBlocks: React.FunctionComponent<CodeBlocksProps> = React.memo(function CodeBlocksContent({
    displayText,
    copyButtonClassName,
    insertButtonClassName,
    CopyButtonProps,
    RecipeWidgetWrapper,
    transcriptRef,
}) {
    const rootRef = useRef<HTMLDivElement>(null)
    console.log('transcriptRef??', transcriptRef)

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
                    createButtons(preText, copyButtonClassName, CopyButtonProps, insertButtonClassName)
                )
            }
        }
    }, [displayText, CopyButtonProps, copyButtonClassName, insertButtonClassName, rootRef])
    console.log('transcriptRef??')

    const RecipeWidgetWrapperWithProps = useMemo(
        () => (props: { targetRef: RefObject<HTMLElement>; transcriptRef: RefObject<HTMLElement>; children: any }) => {
            if (RecipeWidgetWrapper) {
                return <RecipeWidgetWrapper {...props} />
            }
            return null
        },
        [rootRef]
    )

    return useMemo(() => {
        if (RecipeWidgetWrapper && transcriptRef) {
            return (
                <RecipeWidgetWrapperWithProps targetRef={rootRef} transcriptRef={transcriptRef}>
                    <div
                        ref={rootRef}
                        className={styles.popoverWrapper}
                        dangerouslySetInnerHTML={{ __html: renderCodyMarkdown(displayText) }}
                    />
                </RecipeWidgetWrapperWithProps>
            )
        }

        return <div ref={rootRef} dangerouslySetInnerHTML={{ __html: renderCodyMarkdown(displayText) }} />
    }, [displayText, RecipeWidgetWrapper])
})
