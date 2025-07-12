import clsx from 'clsx'
import type React from 'react'
import { useCallback, useState } from 'react'
import { CodyTaskState } from '../../../src/non-stop/state'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/shadcn/ui/tooltip'
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
import type { CodeBlockActionsProps } from './ChatMessageContent'
import styles from './ChatMessageContent.module.css'

export const CopyButton = ({
    text,
    onCopy,
    className = styles.button,
    showLabel = true,
    title = 'Copy Code',
    label = 'Copy',
    icon: customIcon,
}: {
    text: string
    onCopy?: CodeBlockActionsProps['copyButtonOnSubmit']
    className?: string
    showLabel?: boolean
    title?: string
    label?: string
    icon?: JSX.Element
}): React.ReactElement => {
    const [currentLabel, setCurrentLabel] = useState(label)
    const [icon, setIcon] = useState<JSX.Element>(customIcon || CopyCodeBlockIcon)

    const handleClick = useCallback(() => {
        setIcon(CheckCodeBlockIcon)
        setCurrentLabel('Copied')
        navigator.clipboard.writeText(text).catch(error => console.error(error))
        if (onCopy) {
            onCopy(text, 'Button')
        }
        // Log for `chat assistant response code buttons` e2e test.
        console.log('Code: Copy to Clipboard', text)

        setTimeout(() => {
            setIcon(customIcon || CopyCodeBlockIcon)
            setCurrentLabel(label)
        }, 5000)
    }, [onCopy, text, label, customIcon])

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" className={className} onClick={handleClick}>
                    <div className={styles.iconContainer}>{icon}</div>
                    {showLabel && <span className="tw-hidden xs:tw-block">{currentLabel}</span>}
                </button>
            </TooltipTrigger>
            <TooltipContent>{title}</TooltipContent>
        </Tooltip>
    )
}

export type CreateEditButtonsParams = {
    // TODO: Remove this when there is a portable abstraction for popup menus, instead of special-casing VSCode.
    isVSCode: boolean
    copyOnly: boolean
    preText: string
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    onInsert?: CodeBlockActionsProps['insertButtonOnSubmit']
    onSmartApply?: () => void
    onExecute?: () => void
    smartApply?: CodeBlockActionsProps['smartApply']
    smartApplyId?: string
    smartApplyState?: CodyTaskState
    isCodeComplete: boolean
    fileName?: string
}

export function createEditButtons(params: CreateEditButtonsParams): React.ReactElement {
    if (params.copyOnly) {
        return createCopyOnlyButton(params.preText, params.copyButtonOnSubmit)
    }

    return params.smartApply
        ? createEditButtonsSmartApply(params)
        : createEditButtonsBasic(
              params.preText,
              params.copyButtonOnSubmit,
              params.onInsert,
              params.onExecute
          )
}

function createCopyOnlyButton(
    preText: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
): React.ReactElement {
    return <CopyButton text={preText} onCopy={copyButtonOnSubmit} />
}

function createEditButtonsBasic(
    preText: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit'],
    onExecute?: () => void
): React.ReactElement {
    if (!copyButtonOnSubmit) {
        return <div />
    }

    return (
        <>
            <CopyButton text={preText} onCopy={copyButtonOnSubmit} />
            {insertButtonOnSubmit && (
                <div className={styles.insertButtons}>
                    {createInsertButton(preText, insertButtonOnSubmit)}
                    {createSaveButton(preText, insertButtonOnSubmit)}
                </div>
            )}
            {onExecute && createExecuteButton(onExecute)}
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

export function createAdditionsDeletions({
    hasEditIntent,
    preText,
}: { hasEditIntent: boolean; preText: string }): React.ReactElement {
    const { additions, deletions } = getLineChanges(preText)
    const hasAdditionsDeletions = hasEditIntent && (additions >= 0 || deletions >= 0)

    return (
        <div>
            {hasAdditionsDeletions && (
                <>
                    <span className={clsx(styles.addition, styles.stats)}>+{additions}</span>,{' '}
                    <span className={styles.deletion}>-{deletions}</span>
                </>
            )}
        </div>
    )
}

function createEditButtonsSmartApply({
    preText,
    isVSCode,
    copyButtonOnSubmit,
    onInsert,
    onSmartApply,
    onExecute,
    smartApply,
    smartApplyId,
    smartApplyState,
}: CreateEditButtonsParams): React.ReactElement {
    return (
        <>
            {smartApplyState !== CodyTaskState.Applied && copyButtonOnSubmit && (
                <CopyButton text={preText} onCopy={copyButtonOnSubmit} />
            )}
            {smartApply && smartApplyId && smartApplyState === CodyTaskState.Applied && (
                <>
                    {createAcceptButton(smartApplyId, smartApply)}
                    {createRejectButton(smartApplyId, smartApply)}
                </>
            )}
            {smartApplyState !== CodyTaskState.Applied && (
                <>
                    {onExecute && isVSCode && createExecuteButton(onExecute)}
                    {!onExecute &&
                        smartApply &&
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
        </>
    )
}

function createInsertButton(
    preText: string,
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
): React.ReactElement {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className={styles.button}
                    onClick={() => insertButtonOnSubmit?.(preText, false)}
                >
                    <div className={styles.iconContainer}>{InsertCodeBlockIcon}</div>
                    <span className="tw-hidden xs:tw-block">Insert</span>
                </button>
            </TooltipTrigger>
            <TooltipContent>Insert Code at Cursor</TooltipContent>
        </Tooltip>
    )
}

function createSaveButton(
    preText: string,
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
): React.ReactElement {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className={styles.button}
                    onClick={() => insertButtonOnSubmit?.(preText, true)}
                >
                    <div className={styles.iconContainer}>{SaveCodeBlockIcon}</div>
                    <span className="tw-hidden xs:tw-block">Save</span>
                </button>
            </TooltipTrigger>
            <TooltipContent>Save Code to New File…</TooltipContent>
        </Tooltip>
    )
}

function createApplyButton(
    onSmartApply: () => void,
    smartApplyState?: CodyTaskState
): React.ReactElement {
    let disabled = false
    let label = 'Apply'
    let icon = SparkleIcon
    let onClick: () => void = onSmartApply

    switch (smartApplyState) {
        case 'Working':
            disabled = true
            label = 'Applying'
            icon = SyncSpinIcon
            onClick = () => {}
            break
        case 'Applied':
        case 'Finished':
            label = 'Reapply'
            icon = RefreshIcon
            break
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" className={styles.button} onClick={onClick} disabled={disabled}>
                    <div className={styles.iconContainer}>{icon}</div>
                    <span className="tw-hidden xs:tw-block">{label}</span>
                </button>
            </TooltipTrigger>
            <TooltipContent>Apply in Editor</TooltipContent>
        </Tooltip>
    )
}

function createExecuteButton(onExecute: () => void): React.ReactElement {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" className={styles.button} onClick={onExecute}>
                    <div
                        className={clsx(
                            styles.iconContainer,
                            'tw-align-middle codicon codicon-terminal'
                        )}
                    />
                    <span className="tw-hidden xs:tw-block">Execute</span>
                </button>
            </TooltipTrigger>
            <TooltipContent>Execute in Terminal</TooltipContent>
        </Tooltip>
    )
}

function createAcceptButton(
    id: string,
    smartApply: CodeBlockActionsProps['smartApply']
): React.ReactElement {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" className={styles.button} onClick={() => smartApply.onAccept(id)}>
                    <div className={styles.iconContainer}>{TickIcon}</div>
                    <span className="tw-hidden xs:tw-block">Accept</span>
                </button>
            </TooltipTrigger>
            <TooltipContent>Accept</TooltipContent>
        </Tooltip>
    )
}

function createRejectButton(
    id: string,
    smartApply: CodeBlockActionsProps['smartApply']
): React.ReactElement {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" className={styles.button} onClick={() => smartApply.onReject(id)}>
                    <div className={styles.iconContainer}>{CloseIcon}</div>
                    <span className="tw-hidden xs:tw-block">Reject</span>
                </button>
            </TooltipTrigger>
            <TooltipContent>Reject</TooltipContent>
        </Tooltip>
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

    const tooltip = 'More Actions…'

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className={styles.button}
                    aria-label={tooltip}
                    data-vscode-context={JSON.stringify(vscodeContext)}
                    onClick={handleClick}
                >
                    {EllipsisIcon}
                </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
    )
}
