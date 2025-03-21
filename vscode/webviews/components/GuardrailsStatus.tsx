import { GuardrailsCheckStatus } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { AlertTriangleIcon, CheckCircleIcon, FileIcon, LoaderIcon, RefreshCwIcon } from 'lucide-react'
import type React from 'react'
import styles from '../chat/ChatMessageContent/ChatMessageContent.module.css'

interface GuardrailsStatusProps {
    status: GuardrailsCheckStatus
    filename?: string
    tooltip?: string
    className?: string
    onRetry?: () => void
}

/**
 * GuardrailsStatus is a UI component that displays the status of a guardrails check.
 * It shows different icons and optional retry button based on the check status.
 */
export const GuardrailsStatus: React.FC<GuardrailsStatusProps> = ({
    status,
    filename,
    tooltip,
    className,
    onRetry,
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
                    <span className={styles.fileNameContainer}>Checking guardrails</span>
                </div>
            )}
            {status === GuardrailsCheckStatus.Success && (
                <div className={styles.status} title={filename}>
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
                </div>
            )}
            {status === GuardrailsCheckStatus.Error && (
                <div className={styles.status}>
                    <AlertTriangleIcon
                        size={14}
                        className={clsx(styles.attributionIconUnavailable, styles.iconContainer)}
                    />
                    <span className={styles.fileNameContainer}>Guardrails API Error</span>
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            type="button"
                            className={styles.button}
                            title="Retry guardrails check"
                        >
                            <div className={styles.iconContainer}>
                                <RefreshCwIcon size={12} />
                            </div>
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
