import React, { useCallback } from 'react'

import { ContextWindowLimitError, RateLimitError, type ChatError } from '@sourcegraph/cody-shared'

import { type ApiPostMessage, type ChatButtonProps, type UserAccountInfo } from '../Chat'

import styles from './ErrorItem.module.css'

/**
 * An error message shown in the chat.
 */
export const ErrorItem: React.FunctionComponent<{
    error: Omit<ChatError, 'isChatErrorGuard'>
    ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
    userInfo: UserAccountInfo
    postMessage?: ApiPostMessage
}> = React.memo(function ErrorItemContent({ error, ChatButtonComponent, userInfo, postMessage }) {
    if (typeof error !== 'string' && error.name === RateLimitError.errorName && postMessage) {
        return (
            <RateLimitErrorItem
                error={error as RateLimitError}
                ChatButtonComponent={ChatButtonComponent}
                userInfo={userInfo}
                postMessage={postMessage}
            />
        )
    }

    if (typeof error !== 'string' && error.name === ContextWindowLimitError.errorName && postMessage) {
        return (
            <ContextWindowLimitErrorItem
                error={error as ContextWindowLimitError}
                ChatButtonComponent={ChatButtonComponent}
                postMessage={postMessage}
            />
        )
    }

    return <RequestErrorItem error={error.message} />
})

/**
 * Renders a generic error message for chat request failures.
 */
export const RequestErrorItem: React.FunctionComponent<{
    error: string
}> = React.memo(function ErrorItemContent({ error }) {
    return (
        <div className={styles.requestError}>
            <span className={styles.requestErrorTitle}>Request Failed: </span>
            {error}
        </div>
    )
})

const ContextWindowLimitErrorItem: React.FunctionComponent<{
    error: ContextWindowLimitError
    ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
    postMessage: ApiPostMessage
}> = React.memo(function ContextWindowLimitErrorItemContent({ error, ChatButtonComponent, postMessage }) {
    const onClick = useCallback(() => {
        postMessage({ command: 'reset' })
    }, [postMessage])

    return (
        <div className={styles.errorItem}>
            <div className={styles.icon}>
                <span className="codicon codicon-warning" />
            </div>
            <div className={styles.body}>
                <header>
                    <h1>Context Limit Reached</h1>
                    <p>{error.message}</p>
                </header>
                {ChatButtonComponent && (
                    <div className={styles.actions}>
                        <ChatButtonComponent label="Start New Chat" action="" appearance="primary" onClick={onClick} />
                    </div>
                )}
            </div>
        </div>
    )
})

/**
 * An error message shown in the chat.
 */
const RateLimitErrorItem: React.FunctionComponent<{
    error: RateLimitError
    ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
    userInfo: UserAccountInfo
    postMessage: ApiPostMessage
}> = React.memo(function RateLimitErrorItemContent({ error, ChatButtonComponent, userInfo, postMessage }) {
    // Only show Upgrades if both the error said an upgrade was available and we know the user
    // has not since upgraded.
    const isEnterpriseUser = userInfo.isDotComUser !== true
    const canUpgrade = error.upgradeIsAvailable && !userInfo?.isCodyProUser
    const tier = isEnterpriseUser ? 'enterprise' : canUpgrade ? 'free' : 'pro'

    // Only log once on mount
    React.useEffect(() => {
        // Log as abuseUsageLimit if pro user run into rate limit
        postMessage({
            command: 'event',
            eventName: canUpgrade
                ? 'CodyVSCodeExtension:upsellUsageLimitCTA:shown'
                : 'CodyVSCodeExtension:abuseUsageLimitCTA:shown',
            properties: { limit_type: 'chat_commands', tier },
        })

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onButtonClick = useCallback(
        (page: 'upgrade' | 'rate-limits', call_to_action: 'upgrade' | 'learn-more'): void => {
            // Log click event
            postMessage({
                command: 'event',
                eventName: 'CodyVSCodeExtension:upsellUsageLimitCTA:clicked',
                properties: { limit_type: 'chat_commands', call_to_action, tier },
            })

            // open the page in browser
            postMessage({ command: 'show-page', page })
        },
        [postMessage, tier]
    )

    return (
        <div className={styles.errorItem}>
            {canUpgrade && <div className={styles.icon}>⚡️</div>}
            <div className={styles.body}>
                <header>
                    <h1>{canUpgrade ? 'Upgrade to Cody Pro' : 'Unable to Send Message'}</h1>
                    <p>
                        {error.userMessage}
                        {canUpgrade &&
                            ' Upgrade to Cody Pro for unlimited autocomplete suggestions, chat messages and commands.'}
                    </p>
                </header>
                {ChatButtonComponent && (
                    <div className={styles.actions}>
                        {canUpgrade && (
                            <ChatButtonComponent
                                label="Upgrade"
                                action=""
                                onClick={() => onButtonClick('upgrade', 'upgrade')}
                                appearance="primary"
                            />
                        )}
                        <ChatButtonComponent
                            label={canUpgrade ? 'See Plans →' : 'Learn More'}
                            action=""
                            onClick={() =>
                                canUpgrade
                                    ? onButtonClick('upgrade', 'upgrade')
                                    : onButtonClick('rate-limits', 'learn-more')
                            }
                            appearance="secondary"
                        />
                    </div>
                )}
                {error.retryMessage && <p className={styles.retryMessage}>{error.retryMessage}</p>}
            </div>
            {canUpgrade && (
                <div className={styles.bannerContainer}>
                    <div
                        className={styles.banner}
                        role="button"
                        tabIndex={-1}
                        onClick={() => onButtonClick('upgrade', 'upgrade')}
                        onKeyDown={() => onButtonClick('upgrade', 'upgrade')}
                    >
                        Go Pro
                    </div>
                </div>
            )}
        </div>
    )
})
