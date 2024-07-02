import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import { clsx } from 'clsx'
import { useCallback, useState } from 'react'
import { OllamaLogo } from '../icons/LLMProviderIcons'
import type { VSCodeWrapper } from '../utils/VSCodeApi'
import styles from './ConnectionIssuesPage.module.css'

export const ConnectionIssuesPage: React.FunctionComponent<
    React.PropsWithoutRef<{
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

    const onOfflineClick = useCallback(() => {
        vscodeAPI.postMessage({ command: 'auth', authKind: 'offline' })
    }, [vscodeAPI])

    const onSignOut = useCallback(() => {
        vscodeAPI.postMessage({ command: 'auth', authKind: 'signout' })
    }, [vscodeAPI])

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                <div className={styles.icon}>
                    <i className="codicon codicon-debug-disconnect" />
                </div>
                <div className={styles.messageContainer}>
                    <p className={styles.message}>
                        Cody could not start due to a connection issue. Possible causes:
                    </p>
                    <ul className={styles.causes}>
                        <li>You don't have internet access</li>
                        <li>Proxy settings might need to be configured</li>
                        <li>An internal error preventing the connection</li>
                        <li>
                            The configured endpoint{' '}
                            {configuredEndpoint && (
                                <a target="_blank" rel="noreferrer" href={configuredEndpoint}>
                                    {configuredEndpoint}
                                </a>
                            )}{' '}
                            is not reachable
                        </li>
                    </ul>
                </div>
                <div className={styles.actions}>
                    <VSCodeButton
                        className={clsx(styles.actionButton)}
                        type="button"
                        disabled={cooldown}
                        onClick={onRetry}
                    >
                        {cooldown ? 'Retrying...' : 'Retry Connection'}
                    </VSCodeButton>
                    <VSCodeButton
                        className={clsx(styles.actionButton)}
                        appearance="secondary"
                        type="button"
                        onClick={onSignOut}
                    >
                        Sign Out
                    </VSCodeButton>
                </div>
                <div className={styles.actions}>
                    <OllamaLogo size={50} className={styles.icon} />
                    <VSCodeButton
                        className={clsx(styles.actionButton)}
                        type="button"
                        onClick={onOfflineClick}
                    >
                        Use Cody Offline with Ollama
                    </VSCodeButton>
                </div>
            </div>
        </div>
    )
}
