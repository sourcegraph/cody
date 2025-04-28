import clsx from 'clsx'
import type React from 'react'
import { memo, useCallback, useState } from 'react'
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
import type { CodeBlockActionsProps } from './ChatMessageContent'
import styles from './ChatMessageContent.module.css'

/**
 * Higher-order component to create button components with shared behavior
 * @param defaultProps Default props for the component
 * @param renderFn Function to render the component
 * @returns A memoized React component
 */
export function createButtonComponent<P>(
    defaultProps: Partial<P>,
    renderFn: (props: P) => React.ReactElement
) {
    return memo((props: P) => renderFn({ ...defaultProps, ...props } as P))
}

export type CreateEditButtonsParams = {
    // TODO: Remove this when there is a portable abstraction for popup menus, instead of special-casing VSCode.
    isVSCode: boolean
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
    return params.smartApply
        ? createEditButtonsSmartApply(params)
        : createEditButtonsBasic(
              params.preText,
              params.copyButtonOnSubmit,
              params.onInsert,
              params.onExecute
          )
}

export function createEditButtonsBasic(
    preText: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit'],
    onExecute?: () => void
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

export function createEditButtonsSmartApply({
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
    const copyButton = createCopyButton(preText, copyButtonOnSubmit ?? (() => {}))

    return (
        <>
            {smartApplyState !== CodyTaskState.Applied && copyButtonOnSubmit && copyButton}
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
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit'],
    icon?: JSX.Element
): React.ReactElement {
    return <InsertButton text={preText} onInsert={insertButtonOnSubmit} icon={icon} />
}

function createSaveButton(
    preText: string,
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit'],
    icon?: JSX.Element
): React.ReactElement {
    return <SaveButton text={preText} onInsert={insertButtonOnSubmit} icon={icon} />
}

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
    // Use the appropriate component based on the type
    switch (type) {
        case 'copy':
            return (
                <CopyButton
                    text={text}
                    onCopy={codeBlockActions.copy}
                    title={title}
                    icon={defaultIcon}
                />
            )
        case 'insert':
            return (
                <InsertButton
                    text={text}
                    onInsert={codeBlockActions.insert}
                    title={title}
                    icon={defaultIcon}
                />
            )
        case 'new':
            return (
                <SaveButton
                    text={text}
                    onInsert={codeBlockActions.insert}
                    title={title}
                    icon={defaultIcon}
                />
            )
        default:
            return <></>
    }
}

// Base interface for all button components
export interface BaseButtonProps {
    className?: string
    showLabel?: boolean
    title?: string
    label?: string
    icon?: JSX.Element
    disabled?: boolean
}

// Generic action button props with specific action type
export interface ActionButtonProps<T extends unknown[] = []> extends BaseButtonProps {
    onClick: (...args: T) => void
    icon: JSX.Element
}

// Add ChatButtonOptions interface to define the options for the button
export interface ChatButtonOptions extends BaseButtonProps {
    pressedLabel?: string
}

// Extended options for CopyButton using the generic pattern
export interface CopyButtonProps extends Omit<ChatButtonOptions, 'icon'> {
    text: string
    onCopy?: CodeBlockActionsProps['copyButtonOnSubmit']
    icon?: JSX.Element
}

export const ActionButton: React.FC<ActionButtonProps<[]>> = memo(
    ({ onClick, title, icon, label, showLabel = true, className = styles.button, disabled = false }) => {
        return (
            <button
                type="button"
                className={className}
                onClick={onClick}
                title={title}
                disabled={disabled}
            >
                <div className={styles.iconContainer}>{icon}</div>
                {showLabel && label && <span className="tw-hidden xs:tw-block">{label}</span>}
            </button>
        )
    }
)

// Create CopyButton using the HOC
export const CopyButton = createButtonComponent<CopyButtonProps>(
    {
        label: 'Copy',
        pressedLabel: 'Copied',
        className: styles.button,
        showLabel: true,
        title: 'Copy Code',
    },
    ({ text, onCopy, label, pressedLabel, className, showLabel, title, icon: customIcon }) => {
        const [currentLabel, setCurrentLabel] = useState(label)
        const [icon, setIcon] = useState<JSX.Element>(customIcon || CopyCodeBlockIcon)

        const handleClick = useCallback(() => {
            setIcon(CheckCodeBlockIcon)
            setCurrentLabel(pressedLabel)
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
        }, [onCopy, text, label, pressedLabel, customIcon])

        return (
            <ActionButton
                onClick={handleClick}
                title={title}
                icon={icon}
                label={currentLabel}
                showLabel={showLabel}
                className={className}
            />
        )
    }
)

// Insert button component
export interface InsertButtonProps extends Omit<BaseButtonProps, 'icon'> {
    text: string
    onInsert?: CodeBlockActionsProps['insertButtonOnSubmit']
    icon?: JSX.Element
}

// Create InsertButton using the HOC
export const InsertButton = createButtonComponent<InsertButtonProps>(
    {
        title: 'Insert Code at Cursor',
        label: 'Insert',
    },
    ({ text, onInsert, title, icon: customIcon }) => {
        const handleClick = useCallback(() => {
            if (onInsert) {
                onInsert(text, false)
            }
        }, [onInsert, text])

        return (
            <ActionButton
                onClick={handleClick}
                title={title}
                icon={customIcon || InsertCodeBlockIcon}
                label="Insert"
            />
        )
    }
)

// Save button component
export interface SaveButtonProps extends Omit<BaseButtonProps, 'icon'> {
    text: string
    onInsert?: CodeBlockActionsProps['insertButtonOnSubmit']
    icon?: JSX.Element
}

// Create SaveButton using the HOC
export const SaveButton = createButtonComponent<SaveButtonProps>(
    {
        title: 'Save Code to New File...',
        label: 'Save',
    },
    ({ text, onInsert, title, icon: customIcon }) => {
        const handleClick = useCallback(() => {
            if (onInsert) {
                onInsert(text, true)
            }
        }, [onInsert, text])

        return (
            <ActionButton
                onClick={handleClick}
                title={title}
                icon={customIcon || SaveCodeBlockIcon}
                label="Save"
            />
        )
    }
)

// Apply button component
export interface ApplyButtonProps extends Omit<ActionButtonProps<[]>, 'onClick' | 'icon'> {
    onApply: () => void
    state?: CodyTaskState
}

// Create ApplyButton using the HOC
export const ApplyButton = createButtonComponent<ApplyButtonProps>(
    {
        title: 'Apply in Editor',
    },
    ({ onApply, state }) => {
        let disabled = false
        let label = 'Apply'
        let icon = SparkleIcon
        let onClick: () => void = onApply

        switch (state) {
            case 'Working':
                disabled = true
                label = 'Applying'
                icon = SyncSpinIcon
                onClick = () => {} // Use empty function instead of undefined
                break
            case 'Applied':
            case 'Finished':
                label = 'Reapply'
                icon = RefreshIcon
                break
        }

        return (
            <ActionButton
                onClick={onClick || (() => {})}
                title="Apply in Editor"
                icon={icon}
                label={label}
                disabled={disabled}
            />
        )
    }
)

// Execute button component
export interface ExecuteButtonProps extends Omit<ActionButtonProps<[]>, 'onClick' | 'icon'> {
    onExecute: () => void
}

// Create ExecuteButton using the HOC
export const ExecuteButton = createButtonComponent<ExecuteButtonProps>(
    {
        title: 'Execute in Terminal',
        label: 'Execute',
    },
    ({ onExecute }) => {
        return (
            <ActionButton
                onClick={onExecute}
                title="Execute in Terminal"
                icon={
                    <div
                        className={clsx(
                            styles.iconContainer,
                            'tw-align-middle codicon codicon-terminal'
                        )}
                    />
                }
                label="Execute"
            />
        )
    }
)

// Accept button component
export interface AcceptButtonProps extends Omit<ActionButtonProps<[]>, 'onClick' | 'icon'> {
    id: string
    smartApply: CodeBlockActionsProps['smartApply']
}

// Create AcceptButton using the HOC
export const AcceptButton = createButtonComponent<AcceptButtonProps>(
    {
        title: 'Accept Changes',
        label: 'Accept',
    },
    ({ id, smartApply }) => {
        const handleClick = useCallback(() => {
            smartApply.onAccept(id)
        }, [id, smartApply])

        return (
            <ActionButton onClick={handleClick} title="Accept Changes" icon={TickIcon} label="Accept" />
        )
    }
)

// Reject button component
export interface RejectButtonProps extends Omit<ActionButtonProps<[]>, 'onClick' | 'icon'> {
    id: string
    smartApply: CodeBlockActionsProps['smartApply']
}

// Create RejectButton using the HOC
export const RejectButton = createButtonComponent<RejectButtonProps>(
    {
        title: 'Reject Changes',
        label: 'Reject',
    },
    ({ id, smartApply }) => {
        const handleClick = useCallback(() => {
            smartApply.onReject(id)
        }, [id, smartApply])

        return (
            <ActionButton onClick={handleClick} title="Reject Changes" icon={CloseIcon} label="Reject" />
        )
    }
)

export function createCopyButton(
    preText: string,
    onCopy: CodeBlockActionsProps['copyButtonOnSubmit'],
    options?: ChatButtonOptions & { icon?: JSX.Element }
): React.ReactElement {
    return <CopyButton text={preText} onCopy={onCopy} {...options} />
}

function createApplyButton(
    onSmartApply: () => void,
    smartApplyState?: CodyTaskState
): React.ReactElement {
    return <ApplyButton onApply={onSmartApply} state={smartApplyState} />
}

/**
 * Creates a button that sends the command to the editor terminal on click.
 *
 * @param onExecute - the callback to run when the button is clicked.
 */
export function createExecuteButton(onExecute: () => void): React.ReactElement {
    return <ExecuteButton onExecute={onExecute} />
}

function createAcceptButton(
    id: string,
    smartApply: CodeBlockActionsProps['smartApply']
): React.ReactElement {
    return <AcceptButton id={id} smartApply={smartApply} />
}

function createRejectButton(
    id: string,
    smartApply: CodeBlockActionsProps['smartApply']
): React.ReactElement {
    return <RejectButton id={id} smartApply={smartApply} />
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
