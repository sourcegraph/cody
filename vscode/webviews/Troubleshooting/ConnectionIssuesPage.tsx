import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import type { TelemetryService } from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import { useCallback, useState } from 'react'
import type { VSCodeWrapper } from '../utils/VSCodeApi'
import styles from './ConnectionIssuesPage.module.css'

export const ConnectionIssuesPage: React.FunctionComponent<
    React.PropsWithoutRef<{
        telemetryService: TelemetryService
        vscodeAPI: VSCodeWrapper
        configuredEndpoint: string | undefined | null
    }>
> = ({ vscodeAPI, configuredEndpoint }) => {
    const [cooldown, setCooldown] = useState(false)
    const onRetry = useCallback(() => {
        vscodeAPI.postMessage({ command: 'troubleshoot/reloadAuth' })

        // we just set some visual indication here that something is happening.
        setCooldown(true)
        const cooldownTimeout = setTimeout(() => {
            setCooldown(false)
        }, 3000)
        return () => {
            setCooldown(false)
            if (cooldownTimeout) {
                clearTimeout(cooldownTimeout)
            }
        }
    }, [vscodeAPI])

    const onDebug = useCallback(() => {
        vscodeAPI.postMessage({ command: 'troubleshoot/showOutputLogs' })
    }, [vscodeAPI])

    const onReset = useCallback(() => {
        vscodeAPI.postMessage({ command: 'troubleshoot/fullReset', askConfirmation: true })
    }, [vscodeAPI])

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                <div className={styles.icon}>
                    <i className="codicon codicon-debug-disconnect" />
                </div>
                <div className={styles.messageContainer}>
                    <p className={styles.message}>
                        Cody could not start due to a possible connection issue. Possible causes:
                    </p>
                    <ul className={styles.causes}>
                        <li>You don't have internet access</li>
                        <li>
                            The configured endpoint{' '}
                            {configuredEndpoint && (
                                <a target="_blank" rel="noreferrer" href={configuredEndpoint}>
                                    {configuredEndpoint}
                                </a>
                            )}{' '}
                            is not reachable
                        </li>
                        <li>An internal error preventing the connection</li>
                    </ul>
                </div>
                <div className={styles.actions}>
                    <VSCodeButton
                        className={classNames(styles.actionButton)}
                        type="button"
                        disabled={cooldown}
                        onClick={onRetry}
                    >
                        {cooldown ? 'Retrying...' : 'Retry Connection'}
                    </VSCodeButton>
                    <VSCodeButton
                        className={classNames(styles.actionButton)}
                        appearance="secondary"
                        type="button"
                        onClick={onDebug}
                    >
                        Open Debug Logs
                    </VSCodeButton>
                    <VSCodeButton
                        className={classNames(styles.actionButton)}
                        appearance="secondary"
                        type="button"
                        onClick={onReset}
                    >
                        Reset Cody
                    </VSCodeButton>
                </div>
            </div>
        </div>
    )
}
