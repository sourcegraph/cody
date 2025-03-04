import { type Guardrails, isError } from '@sourcegraph/cody-shared'
import type { FixupTaskID } from '../../../src/non-stop/FixupTask'
import { CodyTaskState } from '../../../src/non-stop/state'
import {
    CheckCodeBlockIcon,
    CloseIcon,
    CopyCodeBlockIcon,
    EllipsisIcon,
    InsertCodeBlockIcon,
    RefreshIcon,
    SaveCodeBlockIcon,
    SparkleIcon,
    SyncSpinIcon,
    TickIcon,
} from '../../icons/CodeBlockActionIcons'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
import type { Config } from '../../utils/useConfig'
import type { PriorHumanMessageInfo } from '../cells/messageCell/assistant/AssistantMessageCell'
import type { CodeBlockActionsProps } from './ChatMessageContent'
import styles from './ChatMessageContent.module.css'
import { GuardrailsStatusController } from './GuardRailStatusController'
import { getFileName } from './utils'

export function createButtons(
    preText: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
): HTMLElement {
    if (!copyButtonOnSubmit) {
        const emptyContainer = document.createElement('div')
        emptyContainer.dataset.containerType = 'buttons'
        return emptyContainer
    }

    // Create container for action buttons
    const buttonContainer = document.createElement('div')
    buttonContainer.className = styles.buttonsContainer
    buttonContainer.dataset.containerType = 'actions'

    // Create buttons container
    const buttons = document.createElement('div')
    buttons.className = styles.buttons

    const codeBlockActions = {
        copy: copyButtonOnSubmit,
        insert: insertButtonOnSubmit,
    }

    const copyButton = createCodeBlockActionButton(
        'copy',
        preText,
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
                preText,
                'Insert Code at Cursor',
                InsertCodeBlockIcon,
                codeBlockActions
            )
        )

        buttons.append(
            createCodeBlockActionButton(
                'new',
                preText,
                'Save Code to New File...',
                SaveCodeBlockIcon,
                codeBlockActions
            )
        )
    }

    buttonContainer.appendChild(buttons)

    // Return a container with both preview and action containers
    const container = document.createElement('div')
    container.dataset.containerType = 'buttons'
    container.appendChild(buttonContainer)
    return container
}

function getLineChanges(text: string): { additions: number; deletions: number } {
    const lines = text?.split('\n') ?? []
    let additions = 0
    let deletions = 0

    for (const line of lines) {
        if (line?.startsWith('+')) additions++
        if (line?.startsWith('-')) deletions++
    }

    return { additions, deletions }
}

export function createButtonsExperimentalUI(
    preText: string,
    humanMessage: PriorHumanMessageInfo | null,
    config: Config,
    codeBlockName?: string, // The name of the code block, can be file name or 'command'.
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit'],
    smartApply?: CodeBlockActionsProps['smartApply'],
    smartApplyId?: string,
    smartApplyState?: CodyTaskState,
    guardrails?: Guardrails,
    isMessageLoading?: boolean
): HTMLElement {
    // Create button container 1 for file info
    const previewContainer = document.createElement('div')
    previewContainer.className = styles.buttonsContainer
    previewContainer.dataset.containerType = 'preview'

    let hasPreviewContent = false
    let previewElement = null

    const leftInfo = document.createElement('div')
    if (humanMessage?.intent === 'edit') {
        const { additions, deletions } = getLineChanges(preText)
        if (additions >= 0 || deletions >= 0) {
            const stats = document.createElement('span')
            stats.innerHTML = `<span class="${styles.addition}">+${additions}</span>, <span class="${styles.deletion}">-${deletions}</span>`
            stats.className = styles.stats
            leftInfo.appendChild(stats)
            previewElement = previewContainer
            hasPreviewContent = true
        }
    }
    previewContainer.appendChild(leftInfo)

    // Create button container 2 for action buttons
    const actionsContainer = document.createElement('div')
    actionsContainer.className = styles.buttonsContainer
    actionsContainer.dataset.containerType = 'actions'

    if (!copyButtonOnSubmit) {
        const buttonsContainer = document.createElement('div')
        buttonsContainer.dataset.containerType = 'buttons'
        buttonsContainer.append(previewContainer, actionsContainer)
        if (hasPreviewContent && previewElement) {
            buttonsContainer.prepend(previewContainer)
        }
        return buttonsContainer
    }

    const buttons = document.createElement('div')
    buttons.className = styles.buttons

    // Create container for action buttons to keep them grouped
    const actionButtons = document.createElement('div')
    actionButtons.className = styles.actionButtons
    buttons.appendChild(actionButtons)

    // Create metadata container for guardrails and filename
    const metadataContainer = document.createElement('div')
    metadataContainer.className = styles.metadataContainer

    // Add guardrails if needed
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

    // Add filename if present
    if (codeBlockName && codeBlockName !== 'command') {
        const fileNameContainer = document.createElement('div')
        fileNameContainer.className = styles.fileNameContainer
        fileNameContainer.textContent = getFileName(codeBlockName)
        fileNameContainer.title = codeBlockName
        metadataContainer.append(fileNameContainer)
    }

    buttons.appendChild(metadataContainer)

    if (smartApply && smartApplyState === CodyTaskState.Applied && smartApplyId) {
        const acceptButton = createAcceptButton(smartApplyId, smartApply)
        const rejectButton = createRejectButton(smartApplyId, smartApply)
        actionButtons.append(acceptButton, rejectButton)
    } else {
        const copyButton = createCopyButton(preText, copyButtonOnSubmit)
        actionButtons.append(copyButton)

        if (smartApply && smartApplyId) {
            // Execute button is only available in VS Code.
            const isExecutable = codeBlockName === 'command'
            const smartButton =
                isExecutable && config.clientCapabilities.isVSCode
                    ? createExecuteButton(preText)
                    : createApplyButton(
                          preText,
                          humanMessage,
                          smartApply,
                          smartApplyId,
                          smartApplyState,
                          codeBlockName
                      )
            smartButton.title = isExecutable ? 'Execute in Terminal' : 'Apply in Editor'
            actionButtons.append(smartButton)
        }

        if (config.clientCapabilities.isVSCode) {
            // VS Code provides additional support for rendering an OS-native dropdown, that has some
            // additional benefits. Mainly that it can "break out" of the webview.
            // TODO: A dropdown would be useful for other clients too, we should consider building
            // a generic web-based dropdown component that can be used by any client.
            const actionsDropdown = createActionsDropdown(preText)
            actionButtons.append(actionsDropdown)
        } else {
            const insertButton = createInsertButton(preText, insertButtonOnSubmit)
            const saveButton = createSaveButton(preText, insertButtonOnSubmit)
            actionButtons.append(insertButton, saveButton)
        }
    }

    actionsContainer.appendChild(buttons)

    // Return a container with both preview and action containers
    const buttonsContainer = document.createElement('div')
    buttonsContainer.dataset.containerType = 'buttons'
    buttonsContainer.append(previewContainer, actionsContainer)
    return buttonsContainer
}

function createInsertButton(
    preText: string,
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
): HTMLElement {
    const button = document.createElement('button')
    button.title = 'Insert Code at Cursor'
    button.className = styles.button
    button.innerHTML = InsertCodeBlockIcon
    if (insertButtonOnSubmit) {
        button.addEventListener('click', () => {
            insertButtonOnSubmit(preText, false)
        })
    }
    return button
}

function createSaveButton(
    preText: string,
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
): HTMLElement {
    const button = document.createElement('button')
    button.title = 'Save Code to New File...'
    button.className = styles.button
    button.innerHTML = SaveCodeBlockIcon
    if (insertButtonOnSubmit) {
        button.addEventListener('click', () => insertButtonOnSubmit(preText, true))
    }
    return button
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

            // Log for `chat assistant response code buttons` e2e test.
            console.log('Code: Copy to Clipboard', text)
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

function wrapTextWithResponsiveSpan(text: string): string {
    return `<span class="tw-hidden xs:tw-block">${text}</span>`
}

function createCopyButton(
    preText: string,
    onCopy: CodeBlockActionsProps['copyButtonOnSubmit']
): HTMLElement {
    const button = document.createElement('button')
    button.innerHTML = wrapTextWithResponsiveSpan('Copy')
    button.className = styles.button

    const iconContainer = document.createElement('div')
    iconContainer.className = styles.iconContainer
    iconContainer.innerHTML = CopyCodeBlockIcon
    button.prepend(iconContainer)

    button.addEventListener('click', () => {
        iconContainer.innerHTML = CheckCodeBlockIcon
        iconContainer.className = styles.iconContainer
        button.innerHTML = wrapTextWithResponsiveSpan('Copied')
        button.className = styles.button
        button.prepend(iconContainer)

        navigator.clipboard.writeText(preText).catch(error => console.error(error))
        onCopy(preText, 'Button')
        setTimeout(() => {
            // Reset the icon to the original.
            iconContainer.innerHTML = CopyCodeBlockIcon
            iconContainer.className = styles.iconContainer
            button.innerHTML = wrapTextWithResponsiveSpan('Copy')
            button.className = styles.button
            button.prepend(iconContainer)
        }, 5000)

        // Log for `chat assistant response code buttons` e2e test.
        console.log('Code: Copy to Clipboard', preText)
    })

    return button
}

function createApplyButton(
    preText: string,
    humanMessage: PriorHumanMessageInfo | null,
    smartApply: CodeBlockActionsProps['smartApply'],
    smartApplyId: FixupTaskID,
    smartApplyState?: CodyTaskState,
    fileName?: string
): HTMLElement {
    const button = document.createElement('button')
    button.className = styles.button
    switch (smartApplyState) {
        case 'Working': {
            button.innerHTML = wrapTextWithResponsiveSpan('Applying')
            button.disabled = true

            // Add Loading Icon
            const iconContainer = document.createElement('div')
            iconContainer.className = styles.iconContainer
            iconContainer.innerHTML = SyncSpinIcon
            button.prepend(iconContainer)

            break
        }
        case 'Applied':
        case 'Finished': {
            button.innerHTML = wrapTextWithResponsiveSpan('Reapply')

            // Add Refresh Icon
            const iconContainer = document.createElement('div')
            iconContainer.className = styles.iconContainer
            iconContainer.innerHTML = RefreshIcon
            button.prepend(iconContainer)

            button.addEventListener('click', () =>
                smartApply.onSubmit({
                    id: smartApplyId,
                    text: preText,
                    instruction: humanMessage?.text,
                    fileName,
                })
            )

            break
        }
        default: {
            button.innerHTML = wrapTextWithResponsiveSpan('Apply')

            // Add Sparkle Icon
            const iconContainer = document.createElement('div')
            iconContainer.className = styles.iconContainer
            iconContainer.innerHTML = SparkleIcon
            button.prepend(iconContainer)

            button.addEventListener('click', () =>
                smartApply.onSubmit({
                    id: smartApplyId,
                    text: preText,
                    instruction: humanMessage?.text,
                    fileName,
                })
            )
        }
    }

    return button
}

/**
 * Creates a button that sends the command to the editor terminal on click.
 *
 * @param command - The command to be executed when the button is clicked.
 * @returns An HTMLElement representing the created button.
 */
function createExecuteButton(command: string): HTMLElement {
    const button = document.createElement('button')
    button.className = styles.button
    button.innerHTML = wrapTextWithResponsiveSpan('Execute')
    button.title = 'Send command to Terminal'
    const iconContainer = document.createElement('div')
    iconContainer.className = styles.iconContainer
    iconContainer.innerHTML = '<i class="codicon codicon-terminal tw-align-middle"></i>'
    button.prepend(iconContainer)

    button.addEventListener('click', () => {
        return getVSCodeAPI().postMessage({
            command: 'command',
            id: 'cody.terminal.execute',
            arg: command.trim(),
        })
    })

    return button
}

function createAcceptButton(id: string, smartApply: CodeBlockActionsProps['smartApply']): HTMLElement {
    const button = document.createElement('button')
    button.className = styles.button
    button.innerHTML = 'Accept'

    const iconContainer = document.createElement('div')
    iconContainer.className = styles.iconContainer
    iconContainer.innerHTML = TickIcon
    button.prepend(iconContainer)

    button.addEventListener('click', () => {
        smartApply.onAccept(id)
    })
    return button
}

function createRejectButton(id: string, smartApply: CodeBlockActionsProps['smartApply']): HTMLElement {
    const button = document.createElement('button')
    button.className = styles.button
    button.innerHTML = 'Reject'

    const iconContainer = document.createElement('div')
    iconContainer.className = styles.iconContainer
    iconContainer.innerHTML = CloseIcon
    button.prepend(iconContainer)

    button.addEventListener('click', () => {
        smartApply.onReject(id)
    })
    return button
}

function createActionsDropdown(preText: string): HTMLElement {
    const button = document.createElement('button')
    button.innerHTML = EllipsisIcon
    button.title = 'More Actions...'
    button.className = styles.button

    const vscodeContext = {
        webviewSection: 'codeblock-actions',
        preventDefaultContextMenuItems: true,
        text: preText,
    }

    // Attach `data-vscode-context`, this is also provided when the commands are executed,
    // so serves as a way for us to pass `vscodeContext.text` to each relevant command
    button.setAttribute('data-vscode-context', JSON.stringify(vscodeContext))

    button.addEventListener('click', event => {
        event.preventDefault()
        event.target?.dispatchEvent(
            new MouseEvent('contextmenu', {
                bubbles: true,
                clientX: event.clientX,
                clientY: event.clientY,
            })
        )
        event.stopPropagation()
    })

    return button
}
