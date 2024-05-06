import { type Guardrails, isError, renderCodyMarkdown } from '@sourcegraph/cody-shared'
import mermaid from 'mermaid'
import type React from 'react'
import { useEffect, useRef } from 'react'

import {
    CheckCodeBlockIcon,
    CopyCodeBlockIcon,
    InsertCodeBlockIcon,
    SaveCodeBlockIcon,
    ShieldIcon,
} from '../icons/CodeBlockActionIcons'

import { clsx } from 'clsx'
import styles from './ChatMessageContent.module.css'

export interface CodeBlockActionsProps {
    copyButtonOnSubmit: (text: string, event?: 'Keydown' | 'Button') => void
    insertButtonOnSubmit: (text: string, newFile?: boolean) => void
}

interface ChatMessageContentProps {
    displayMarkdown: string
    wrapLinksWithCodyCommand: boolean

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    guardrails?: Guardrails
    isLoading?: boolean
    className?: string
}

function createButtons(
    text: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
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
        codeBlockActions
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
                codeBlockActions
            )
        )

        buttons.append(
            createCodeBlockActionButton(
                'new',
                text,
                'Save Code to New File...',
                SaveCodeBlockIcon,
                codeBlockActions
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
    }
): HTMLElement {
    const button = document.createElement('button')

    const className = type === 'copy' ? styles.copyButton : styles.insertButton

    button.innerHTML = iconSvg
    button.title = title
    button.className = className

    if (type === 'copy') {
        button.addEventListener('click', () => {
            button.innerHTML = CheckCodeBlockIcon
            navigator.clipboard.writeText(text).catch(error => console.error(error))
            button.className = className
            codeBlockActions.copy(text, 'Button')
            setTimeout(() => {
                button.innerHTML = iconSvg
            }, 5000)
        })
    }

    const insertOnSubmit = codeBlockActions.insert
    if (!insertOnSubmit) {
        return button
    }

    switch (type) {
        case 'insert':
            button.addEventListener('click', () => insertOnSubmit(text, false))
            break
        case 'new':
            button.addEventListener('click', () => insertOnSubmit(text, true))
            break
    }

    return button
}

/*
 * GuardrailsStatusController manages the bit of UI with shield icon,
 * and spinner/check mark/status in the bottom-right corner of CodeBlocks
 * when attribution is enabled.
 */
class GuardrailsStatusController {
    readonly statusSpinning = `<i class="codicon codicon-loading ${styles.codiconLoading}"></i>`
    readonly statusPass = '<i class="codicon codicon-pass"></i>'
    readonly statusFailed = 'Guardrails Check Failed'
    readonly statusUnavailable = 'Guardrails API Error'

    readonly iconClass = 'guardrails-icon'
    readonly statusClass = 'guardrails-status'

    private status: HTMLElement

    constructor(public container: HTMLElement) {
        this.findOrAppend(this.iconClass, () => {
            const icon = document.createElement('div')
            icon.innerHTML = ShieldIcon
            icon.classList.add(styles.attributionIcon, this.iconClass)
            icon.setAttribute('data-testid', 'attribution-indicator')
            return icon
        })
        this.status = this.findOrAppend(this.statusClass, () => {
            const status = document.createElement('div')
            status.classList.add(styles.status, this.statusClass)
            return status
        })
    }

    /**
     * setPending displays a spinner next
     * to the attribution shield icon.
     */
    public setPending() {
        this.container.title = 'Guardrails: Running code attribution check…'
        this.status.innerHTML = this.statusSpinning
    }

    /**
     * setSuccess changes spinner on the right-hand side
     * of shield icon to a checkmark.
     */
    public setSuccess() {
        this.container.title = 'Guardrails check passed'
        this.status.innerHTML = this.statusPass
    }

    /**
     * setFailure displays a failure message instead of spinner
     * on the right-hand side of shield icon. Tooltip indicates
     * where attribution was found, and whether the attribution limit was hit.
     */
    public setFailure(repos: string[], limitHit: boolean) {
        this.container.classList.add(styles.attributionIconFound)
        this.container.title = this.tooltip(repos, limitHit)
        this.status.innerHTML = this.statusFailed
    }

    /**
     * setUnavailable displays a failure message instead of spinner
     * on the right-hand side of shield icon. It indicates that attribution
     * search is unavailable.
     */
    public setUnavailable(error: Error) {
        this.container.classList.add(styles.attributionIconUnavailable)
        this.container.title = `Guardrails API error: ${error.message}`
        this.status.innerHTML = this.statusUnavailable
    }

    private findOrAppend(className: string, make: () => HTMLElement): HTMLElement {
        const elements = this.container.getElementsByClassName(className)
        if (elements.length > 0) {
            return elements[0] as HTMLElement
        }
        const newElement = make()
        this.container.append(newElement)
        return newElement
    }

    private tooltip(repos: string[], limitHit: boolean) {
        const prefix = 'Guardrails check failed. Code found in'
        if (repos.length === 1) {
            return `${prefix} ${repos[0]}.`
        }
        const tooltip = `${prefix} ${repos.length} repositories: ${repos.join(', ')}`
        return limitHit ? `${tooltip} or more...` : `${tooltip}.`
    }
}

/**
 * A component presenting the content of a chat message.
 */
export const ChatMessageContent: React.FunctionComponent<ChatMessageContentProps> = ({
    isLoading,
    displayMarkdown,
    wrapLinksWithCodyCommand,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    guardrails,
    className,
}) => {
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const preElements = rootRef.current?.querySelectorAll('pre')

        if (!copyButtonOnSubmit || !preElements) {
            return
        }

        for (const preElement of preElements) {
            const preText = preElement.textContent
            if (preText?.trim() && preElement.parentNode) {
                const buttons = createButtons(preText, copyButtonOnSubmit, insertButtonOnSubmit)
                if (guardrails) {
                    const container = document.createElement('div')
                    container.classList.add(styles.attributionContainer)
                    buttons.append(container)

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
    }, [copyButtonOnSubmit, insertButtonOnSubmit, guardrails])

    useEffect(() => {
        if (isLoading) {
            return
        }

        const mermaidElements = rootRef.current?.querySelectorAll<HTMLElement>(
            'pre > code.language-mermaid'
        )

        if (mermaidElements) {
            for (const el of mermaidElements) {
                el.parentElement?.replaceWith(el)
                el.classList.add(styles.mermaidImage)
            }
            mermaid.initialize({ startOnLoad: false, darkMode: false, securityLevel: 'loose' })
            mermaid.run({ nodes: mermaidElements, suppressErrors: true })
        }
    }, [isLoading])

    return (
        <div
            ref={rootRef}
            className={clsx(styles.content, className)}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: the result is run through dompurify
            dangerouslySetInnerHTML={{
                // wrapLinksWithCodyCommand opens all links in assistant responses using the
                // _cody.vscode.open command (but not human messages because those already
                // have the right URIs and are trusted).
                __html: renderCodyMarkdown(displayMarkdown, { wrapLinksWithCodyCommand }),
            }}
        />
    )
}
