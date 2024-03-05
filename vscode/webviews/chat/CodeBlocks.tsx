import React, { useEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'

import { type Guardrails, isError, renderCodyMarkdown } from '@sourcegraph/cody-shared'

import {
    CheckCodeBlockIcon,
    CopyCodeBlockIcon,
    InsertCodeBlockIcon,
    SaveCodeBlockIcon,
    ShieldIcon,
} from '../icons/CodeBlockActionIcons'

import styles from './CodeBlocks.module.css'

export interface CodeBlockActionsProps {
    copyButtonOnSubmit: (text: string, event?: 'Keydown' | 'Button', metadata?: CodeBlockMeta) => void
    insertButtonOnSubmit: (text: string, newFile?: boolean, metadata?: CodeBlockMeta) => void
}

interface CodeBlocksProps {
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
            button.addEventListener('click', () => insertOnSubmit(text, false, metadata))
            break
        case 'new':
            button.addEventListener('click', () => insertOnSubmit(text, true, metadata))
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

export const CodeBlocks: React.FunctionComponent<CodeBlocksProps> = React.memo(
    function CodeBlocksContent({
        displayText,
        copyButtonClassName,
        copyButtonOnSubmit,
        insertButtonClassName,
        insertButtonOnSubmit,
        metadata,
        guardrails,
    }) {
        const rootRef = useRef<HTMLDivElement>(null)

        useEffect(() => {
            const preElements = rootRef.current?.querySelectorAll('pre')
            if (!preElements?.length || !copyButtonOnSubmit) {
                return
            }

            for (const preElement of preElements) {
                const preText = preElement.textContent
                if (preText?.trim() && preElement.parentNode) {
                    const eventMetadata = {
                        requestID: metadata?.requestID,
                        source: metadata?.source,
                    }
                    const buttons = createButtons(
                        preText,
                        copyButtonClassName,
                        copyButtonOnSubmit,
                        insertButtonClassName,
                        insertButtonOnSubmit,
                        eventMetadata
                    )
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
                            copyButtonOnSubmit(preText, 'Keydown', eventMetadata)
                        }
                    })
                }
            }
        }, [
            copyButtonClassName,
            insertButtonClassName,
            copyButtonOnSubmit,
            insertButtonOnSubmit,
            metadata?.requestID,
            metadata?.source,
            guardrails,
        ])

        return useMemo(
            () => (
                <div
                    ref={rootRef}
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: the result is run through dompurify
                    dangerouslySetInnerHTML={{
                        // wrapLinksWithCodyCommand opens all links using the _cody.vscode.open command
                        __html: renderCodyMarkdown(displayText, { wrapLinksWithCodyCommand: true }),
                    }}
                />
            ),
            [displayText]
        )
    }
)
