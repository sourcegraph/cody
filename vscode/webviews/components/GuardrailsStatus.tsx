import { GuardrailsCheckStatus } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { AlertTriangleIcon, CheckCircleIcon, FileIcon, LoaderIcon } from 'lucide-react'
import type React from 'react'
import type { MouseEventHandler } from 'react'
import styles from '../chat/ChatMessageContent/ChatMessageContent.module.css'

interface GuardrailsStatusProps {
    children?: React.ReactNode
    status: GuardrailsCheckStatus
    filename?: string
    tooltip?: string
    className?: string
    onSuccessAuxClick?: MouseEventHandler<Element>
}

/**
 * GuardrailsStatus is a UI component that displays the status of a guardrails check.
 * It shows different icons and optional retry button based on the check status.
 */
export const GuardrailsStatus: React.FC<GuardrailsStatusProps> = ({
    children,
    status,
    filename,
    tooltip,
    className,
    onSuccessAuxClick,
}) => {
    const containerClasses = clsx(
        'tw-flex tw-items-center tw-gap-1',
        status === GuardrailsCheckStatus.Failed && 'tw-text-[var(--vscode-errorForeground)]',
        status === GuardrailsCheckStatus.Error && 'tw-text-[var(--vscode-warningForeground)]',
        className
    )

    return (
        <div className={containerClasses} title={tooltip} data-testid="guardrails-status">
            {status === GuardrailsCheckStatus.GeneratingCode && (
                <div className={styles.status}>
                    <LoaderIcon className={clsx('tw-animate-spin', styles.iconContainer)} size={14} />
                    <span className={styles.fileNameContainer}>Generating code</span>
                </div>
            )}
            {status === GuardrailsCheckStatus.Checking && (
                <div className={styles.status}>
                    <LoaderIcon className={clsx('tw-animate-spin', styles.iconContainer)} size={14} />
                    <span className={styles.fileNameContainer}>Checking Guardrails</span>
                </div>
            )}
            {status === GuardrailsCheckStatus.Success && (
                <div className={styles.status} title={filename} onAuxClick={onSuccessAuxClick}>
                    <CheckCircleIcon
                        size={14}
                        className={clsx(
                            'tw-inline',
                            'tw-text-[var(--vscode-gitDecoration-addedResourceForeground)]',
                            styles.iconContainer
                        )}
                    />
                    {filename && (
                        <span className={styles.fileNameContainer}>{filename.split('/').pop()}</span>
                    )}
                </div>
            )}
            {status === GuardrailsCheckStatus.Skipped && filename && (
                <div className={styles.status} title={filename}>
                    <FileIcon
                        size={14}
                        className={clsx(
                            'tw-inline',
                            'tw-text-[var(--vscode-gitDecoration-addedResourceForeground)]',
                            styles.iconContainer
                        )}
                    />
                    <span className={styles.fileNameContainer}>{filename.split('/').pop()}</span>
                </div>
            )}
            {status === GuardrailsCheckStatus.Failed && (
                <div className={styles.status}>
                    <AlertTriangleIcon
                        size={14}
                        className={clsx(styles.attributionIconFound, styles.iconContainer)}
                    />
                    <span className={styles.fileNameContainer}>Guardrails: Match found</span>
                </div>
            )}
            {status === GuardrailsCheckStatus.Error && (
                <div className={styles.status}>
                    <AlertTriangleIcon
                        size={14}
                        className={clsx(styles.attributionIconUnavailable, styles.iconContainer)}
                    />
                    <span className={styles.fileNameContainer}>Guardrails API Error</span>
                </div>
            )}
            {children}
        </div>
    )
}
