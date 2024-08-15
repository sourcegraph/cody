import {
    CheckCodeBlockIcon,
    CloseIcon,
    CopyCodeBlockIcon,
    EllipsisIcon,
    InsertCodeBlockIcon,
    SaveCodeBlockIcon,
    SparkleIcon,
    SyncSpinIcon,
    TickIcon,
} from '../../icons/CodeBlockActionIcons'

import { CodyIDE } from '@sourcegraph/cody-shared'
import type { FixupTaskID } from '../../../src/non-stop/FixupTask'
import { CodyTaskState } from '../../../src/non-stop/state'
import type { UserAccountInfo } from '../../Chat'
import type { PriorHumanMessageInfo } from '../cells/messageCell/assistant/AssistantMessageCell'
import type { CodeBlockActionsProps } from './ChatMessageContent'
import styles from './ChatMessageContent.module.css'

export function createButtons(
    preText: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
): HTMLElement {
    const container = document.createElement('div')
    container.className = styles.buttonsContainer

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

    container.append(buttons)

    return container
}

export function createButtonsExperimentalUI(
    preText: string,
    humanMessage: PriorHumanMessageInfo | null,
    userInfo: UserAccountInfo,
    fileName?: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit'],
    smartApply?: CodeBlockActionsProps['smartApply'],
    smartApplyId?: string,
    smartApplyState?: CodyTaskState
): HTMLElement {
    const container = document.createElement('div')
    container.className = styles.buttonsContainer
    if (!copyButtonOnSubmit) {
        return container
    }

    const buttons = document.createElement('div')
    buttons.className = styles.buttons

    if (smartApply && smartApplyState === CodyTaskState.Applied && smartApplyId) {
        const acceptButton = createAcceptButton(smartApplyId, smartApply)
        const rejectButton = createRejectButton(smartApplyId, smartApply)
        buttons.append(acceptButton, rejectButton)
    } else {
        const copyButton = createCopyButton(preText, copyButtonOnSubmit)
        buttons.append(copyButton)

        if (smartApply && smartApplyId) {
            const applyButton = createApplyButton(
                preText,
                humanMessage,
                smartApply,
                smartApplyId,
                smartApplyState,
                fileName
            )
            buttons.append(applyButton)
        }

        if (userInfo.ide === CodyIDE.VSCode) {
            // VS Code provides additional support for rendering an OS-native dropdown, that has some
            // additional benefits. Mainly that it can "break out" of the webview.
            // TODO: A dropdown would be useful for other clients too, we should consider building
            // a generic web-based dropdown component that can be used by any client.
            const actionsDropdown = createActionsDropdown(preText)
            buttons.append(actionsDropdown)
        } else {
            const insertButton = createInsertButton(preText, insertButtonOnSubmit)
            const saveButton = createSaveButton(preText, insertButtonOnSubmit)
            buttons.append(insertButton, saveButton)
        }
    }

    container.append(buttons)

    return container
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

function createCopyButton(
    preText: string,
    onCopy: CodeBlockActionsProps['copyButtonOnSubmit']
): HTMLElement {
    const button = document.createElement('button')
    button.innerHTML = 'Copy'
    button.className = styles.button

    const iconContainer = document.createElement('div')
    iconContainer.className = styles.iconContainer
    iconContainer.innerHTML = CopyCodeBlockIcon
    button.prepend(iconContainer)

    button.addEventListener('click', () => {
        iconContainer.innerHTML = CheckCodeBlockIcon
        iconContainer.className = styles.iconContainer
        button.innerHTML = 'Copied'
        button.className = styles.button
        button.prepend(iconContainer)

        navigator.clipboard.writeText(preText).catch(error => console.error(error))
        onCopy(preText, 'Button')
        setTimeout(() => {
            // Reset the icon to the original.
            iconContainer.innerHTML = CopyCodeBlockIcon
            iconContainer.className = styles.iconContainer
            button.innerHTML = 'Copy'
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
            button.innerHTML = 'Applying'
            button.disabled = true

            // Add Loading Icon
            const iconContainer = document.createElement('div')
            iconContainer.className = styles.iconContainer
            iconContainer.innerHTML = SyncSpinIcon
            button.prepend(iconContainer)

            break
        }
        default: {
            button.innerHTML = 'Apply'

            // Add Sparkle Icon
            const iconContainer = document.createElement('div')
            iconContainer.className = styles.iconContainer
            iconContainer.innerHTML = SparkleIcon
            button.prepend(iconContainer)

            button.addEventListener('click', () => {
                smartApply.onSubmit(smartApplyId, preText, humanMessage?.text, fileName)
            })
        }
    }

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
