import React, { useCallback } from 'react'

import { ChatError, RateLimitError } from '@sourcegraph/cody-shared'

import { ApiPostMessage, ChatButtonProps, UserAccountInfo } from '../Chat'

import styles from './ErrorItem.module.css'

/**
 * An error message shown in the chat.
 */
export const ErrorItem: React.FunctionComponent<{
    error: ChatError
    ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
    userInfo?: UserAccountInfo
    postMessage?: ApiPostMessage
}> = React.memo(function ErrorItemContent({ error, ChatButtonComponent, userInfo, postMessage }) {
    if (typeof error !== 'string' && error.name === RateLimitError.errorName && postMessage) {
        return (
            <RateLimitErrorItem
                error={error as RateLimitError}
                ChatButtonComponent={ChatButtonComponent}
                postMessage={postMessage}
                userInfo={userInfo}
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
        <div className="cody-chat-error">
            <span>Request failed: </span>
            {error}
        </div>
    )
})

/**
 * An error message shown in the chat.
 */
export const RateLimitErrorItem: React.FunctionComponent<{
    error: RateLimitError
    ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
    userInfo?: UserAccountInfo
    postMessage: ApiPostMessage
}> = React.memo(function RateLimitErrorItemContent({ error, ChatButtonComponent, userInfo, postMessage }) {
    // Only show Upgrades if both the error said an upgrade was available and we know the user
    // has not since upgraded.

    const canUpgrade = error.upgradeIsAvailable && userInfo?.isCodyProUser !== true
    const isEnterpriseUser = userInfo?.isDotComUser !== true
    const tier = isEnterpriseUser ? 'enterprise' : userInfo?.isCodyProUser ? 'pro' : 'free'

    // Only log once on mount
    React.useEffect(() => {
        // Log as abuseUsageLimit if pro user run into rate limit
        postMessage({
            command: 'event',
            eventName: userInfo?.isCodyProUser
                ? 'CodyVSCodeExtension:abuseUsageLimitCTA:shown'
                : 'CodyVSCodeExtension:upsellUsageLimitCTA:shown',
            properties: { limit_type: 'chat_commands', tier },
        })

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onButtonClick = useCallback(
        (page: 'upgrade' | 'rate-limits'): void => {
            postMessage({ command: 'show-page', page })
            postMessage({
                command: 'event',
                eventName: 'CodyVSCodeExtension:upsellUsageLimitCTA:clicked',
                properties: { limit_type: 'chat_commands', page, tier },
            })
        },
        [postMessage, tier]
    )

    return (
        <div className={styles.errorItem}>
            <h1>{canUpgrade ? 'Upgrade to Cody Pro' : 'Unable to Send Message'}</h1>
            <p>{error.userMessage}</p>
            {ChatButtonComponent && (
                <div className={styles.actions}>
                    {canUpgrade && (
                        <ChatButtonComponent
                            label="Upgrade"
                            action=""
                            onClick={() => onButtonClick('upgrade')}
                            appearance="primary"
                        />
                    )}
                    <ChatButtonComponent
                        label="Learn More"
                        action=""
                        onClick={() => onButtonClick('rate-limits')}
                        appearance="secondary"
                    />
                </div>
            )}
            <p className={styles.retryMessage}>{error.retryMessage}</p>
        </div>
    )
})
