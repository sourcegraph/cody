import clsx from 'clsx'
import type React from 'react'
import { useCallback, useState } from 'react'
import { CodyTaskState } from '../../../src/non-stop/state'
// TODO: Do these simply duplicate lucide-react icons, can we use them instead?
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
//import type { Config } from '../../utils/useConfig'
//import type { PriorHumanMessageInfo } from '../cells/messageCell/assistant/AssistantMessageCell'
import type { CodeBlockActionsProps } from './ChatMessageContent'
import styles from './ChatMessageContent.module.css'

export type CreateEditButtonsParams = {
    hasEditIntent: boolean
    // TODO: Remove this when there is a portable abstraction for popup menus, instead of special-casing VSCode.
    isVSCode: boolean
    preText: string
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    onInsert?: CodeBlockActionsProps['insertButtonOnSubmit']
    onSmartApply?: () => void
    smartApply?: CodeBlockActionsProps['smartApply']
    smartApplyId?: string
    smartApplyState?: CodyTaskState
    isCodeComplete: boolean
    fileName?: string
    isShellCommand: boolean
}

export function createEditButtons(params: CreateEditButtonsParams): React.ReactElement {
    return params.smartApply
        ? createEditButtonsSmartApply(params)
        : createEditButtonsBasic(params.preText, params.copyButtonOnSubmit, params.onInsert)
}

export function createEditButtonsBasic(
    preText: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
): React.ReactElement {
    if (!copyButtonOnSubmit) {
        return <div />
    }

    const codeBlockActions = {
        copy: copyButtonOnSubmit,
        insert: insertButtonOnSubmit,
    }

    return (
        <>
            {createCodeBlockActionButton(
                'copy',
                preText,
                'Copy Code',
                CopyCodeBlockIcon,
                codeBlockActions
            )}
            {insertButtonOnSubmit && (
                <div className={styles.insertButtons}>
                    {createCodeBlockActionButton(
                        'insert',
                        preText,
                        'Insert Code at Cursor',
                        InsertCodeBlockIcon,
                        codeBlockActions
                    )}
                    {createCodeBlockActionButton(
                        'new',
                        preText,
                        'Save Code to New File...',
                        SaveCodeBlockIcon,
                        codeBlockActions
                    )}
                </div>
            )}
        </>
    )
}

function getLineChanges(text: string): { additions: number; deletions: number } {
    const lines = text?.split('\n') ?? []
    let additions = 0
    let deletions = 0

    for (const line of lines) {
        if (line.startsWith('+')) additions++
        if (line.startsWith('-')) deletions++
    }

    return { additions, deletions }
}

export function createEditButtonsSmartApply({
    preText,
    hasEditIntent,
    isVSCode,
    isShellCommand,
    copyButtonOnSubmit,
    onInsert,
    onSmartApply,
    smartApply,
    smartApplyId,
    smartApplyState,
}: CreateEditButtonsParams): React.ReactElement {
    const { additions, deletions } = getLineChanges(preText)
    const hasAdditionsDeletions = hasEditIntent && (additions >= 0 || deletions >= 0)

    const preview = hasAdditionsDeletions && (
        <div className={styles.buttonContainer}>
            <div>
                {hasAdditionsDeletions && (
                    <>
                        <span className={clsx(styles.addition, styles.stats)}>+{additions}</span>,{' '}
                        <span className={styles.deletion}>-{deletions}</span>
                    </>
                )}
            </div>
        </div>
    )

    const copyButton = createCopyButton(preText, copyButtonOnSubmit ?? (() => {}))

    const buttons = (
        <div className={styles.buttonContainer}>
            <div className={styles.buttons}>
                {smartApplyState !== CodyTaskState.Applied && copyButtonOnSubmit && copyButton}
                {smartApply && smartApplyId && smartApplyState === CodyTaskState.Applied && (
                    <>
                        {createAcceptButton(smartApplyId, smartApply)}
                        {createRejectButton(smartApplyId, smartApply)}
                    </>
                )}
                {smartApply && smartApplyId && smartApplyState !== CodyTaskState.Applied && (
                    <>
                        {isShellCommand && isVSCode && createExecuteButton(preText)}
                        {!isShellCommand &&
                            onSmartApply &&
                            createApplyButton(onSmartApply, smartApplyState)}
                    </>
                )}
                {isVSCode && createActionsDropdown(preText)}
                {!isVSCode && (
                    <>
                        {createInsertButton(preText, onInsert)}
                        {createSaveButton(preText, onInsert)}
                    </>
                )}
            </div>
        </div>
    )

    return (
        <div>
            {preview}
            {buttons}
        </div>
    )
}

function createInsertButton(
    preText: string,
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
): React.ReactElement {
    return (
        <button
            type="button"
            title="Insert Code at Cursor"
            className={styles.button}
            onClick={() => insertButtonOnSubmit?.(preText, false)}
        >
            {InsertCodeBlockIcon}
        </button>
    )
}

function createSaveButton(
    preText: string,
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
): React.ReactElement {
    return (
        <button
            type="button"
            title="Save Code to New File..."
            className={styles.button}
            onClick={() => insertButtonOnSubmit?.(preText, true)}
        >
            {SaveCodeBlockIcon}
        </button>
    )
}

// TODO: De-dup this with createCopyButton, etc. below.
/**
 * Creates a button to perform an action on a code block.
 * @returns The button element.
 */
function createCodeBlockActionButton(
    type: 'copy' | 'insert' | 'new',
    text: string,
    title: string,
    defaultIcon: JSX.Element,
    codeBlockActions: {
        copy: CodeBlockActionsProps['copyButtonOnSubmit']
        insert?: CodeBlockActionsProps['insertButtonOnSubmit']
    }
): React.ReactElement {
    const [icon, setIcon] = useState<JSX.Element>(defaultIcon)
    const handleClick = useCallback(() => {
        switch (type) {
            case 'copy': {
                setIcon(CheckCodeBlockIcon)
                setTimeout(() => setIcon(defaultIcon), 5000)
                navigator.clipboard.writeText(text).catch(error => console.error(error))
                codeBlockActions.copy(text, 'Button')
                // Log for `chat assistant response code buttons` e2e test.
                console.log('Code: Copy to Clipboard', text)
                break
            }
            case 'insert': {
                codeBlockActions.insert?.(text, false)
                break
            }
            case 'new': {
                codeBlockActions.insert?.(text, true)
                break
            }
        }
    }, [defaultIcon, type, text, codeBlockActions])
    return (
        <button
            type="button"
            className={type === 'copy' ? styles.copyButton : styles.insertButton}
            title={title}
            onClick={handleClick}
        >
            {icon}
        </button>
    )
}

function createCopyButton(
    preText: string,
    onCopy: CodeBlockActionsProps['copyButtonOnSubmit']
): React.ReactElement {
    const [[label, icon], setLabel] = useState(['Copy', CopyCodeBlockIcon])

    const onClick = useCallback(() => {
        setLabel(['Copied', CheckCodeBlockIcon])
        navigator.clipboard.writeText(preText).catch(error => console.error(error))
        onCopy(preText, 'Button')
        setTimeout(() => {
            setLabel(['Copy', CopyCodeBlockIcon])
        }, 5000)
        // Log for `chat assistant response code buttons` e2e test.
        console.log('Code: Copy to Clipboard', preText)
    }, [onCopy, preText])
    return (
        <button type="button" className={styles.button} onClick={onClick}>
            <div className={styles.iconContainer}>{icon}</div>
            <span className="tw-hidden xs:tw-block">{label}</span>
        </button>
    )
}

function createApplyButton(
    onSmartApply: () => void,
    smartApplyState?: CodyTaskState
): React.ReactElement {
    let [disabled, label, icon, onClick]: [boolean, string, JSX.Element, (() => void) | undefined] = [
        false,
        'Apply',
        SparkleIcon,
        onSmartApply,
    ]

    switch (smartApplyState) {
        case 'Working':
            ;[disabled, label, icon, onClick] = [true, 'Applying', SyncSpinIcon, undefined]
            break
        case 'Applied':
        case 'Finished':
            ;[disabled, label, icon, onClick] = [false, 'Reapply', RefreshIcon, onSmartApply]
            break
    }

    return (
        <button
            type="button"
            className={styles.button}
            onClick={onClick}
            title="Apply in Editor"
            disabled={disabled}
        >
            <div className={styles.iconContainer}>{icon}</div>
            <span className="tw-hidden xs_tw-block">{label}</span>
        </button>
    )
}

/**
 * Creates a button that sends the command to the editor terminal on click.
 *
 * @param command - The command to be executed when the button is clicked.
 */
export function createExecuteButton(command: string): React.ReactElement {
    const handleClick = useCallback(
        () =>
            getVSCodeAPI().postMessage({
                command: 'command',
                id: 'cody.terminal.execute',
                arg: command.trim(),
            }),
        [command]
    )
    return (
        <button
            type="button"
            className={styles.button}
            onClick={handleClick}
            title="Execute in Terminal"
        >
            <div className={styles.iconContainer}>
                <i className="codicon codicon-terminal tw-align-middle" />
            </div>
            Send command to Terminal
        </button>
    )
}

function createAcceptButton(
    id: string,
    smartApply: CodeBlockActionsProps['smartApply']
): React.ReactElement {
    return (
        <button type="button" className={styles.button} onClick={() => smartApply.onAccept(id)}>
            <div className={styles.iconContainer}>{TickIcon}</div>
            Accept
        </button>
    )
}

function createRejectButton(
    id: string,
    smartApply: CodeBlockActionsProps['smartApply']
): React.ReactElement {
    return (
        <button type="button" className={styles.button} onClick={() => smartApply.onReject(id)}>
            <div className={styles.iconContainer}>{CloseIcon}</div>
            Reject
        </button>
    )
}

// VS Code provides additional support for rendering an OS-native dropdown, that has some
// additional benefits. Mainly that it can "break out" of the webview.
// TODO: A dropdown would be useful for other clients too, we should consider building
// a generic web-based dropdown component that can be used by any client.
function createActionsDropdown(preText: string): React.ReactElement {
    // Attach `data-vscode-context`, this is also provided when the commands are executed,
    // so serves as a way for us to pass `vscodeContext.text` to each relevant command
    const vscodeContext = {
        webviewSection: 'codeblock-actions',
        preventDefaultContextMenuItems: true,
        text: preText,
    }

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = useCallback(event => {
        event.preventDefault()
        event.target?.dispatchEvent(
            new MouseEvent('contextmenu', {
                bubbles: true,
                clientX: event.clientX,
                clientY: event.clientY,
            })
        )
        event.stopPropagation()
    }, [])

    return (
        <button
            type="button"
            title="More Actions..."
            className={styles.button}
            data-vscode-context={JSON.stringify(vscodeContext)}
            onClick={handleClick}
        >
            {EllipsisIcon}
        </button>
    )
}
