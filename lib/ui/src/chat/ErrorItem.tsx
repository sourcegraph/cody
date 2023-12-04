import React from 'react'

import { ChatError, RateLimitError } from '@sourcegraph/cody-shared'

import { ApiPostMessage, ChatButtonProps, UserAccountInfo } from '../Chat'

import styles from './ErrorItem.module.css'

/**
 * An error message shown in the chat.
 */
export const ErrorItem: React.FunctionComponent<{
    error: string | ChatError
    ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
    userInfo?: UserAccountInfo
    postMessage?: ApiPostMessage
}> = React.memo(function ErrorItemContent({ error, ChatButtonComponent, userInfo, postMessage }) {
    return typeof error !== 'string' && error.name === RateLimitError.errorName && postMessage ? (
        <RateLimitErrorItem
            error={error as RateLimitError}
            ChatButtonComponent={ChatButtonComponent}
            postMessage={postMessage}
        />
    ) : (
        <div className="cody-chat-error">
            <span>Request failed: </span>
            {typeof error === 'string' ? error : error.message}
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
                            onClick={() => postMessage({ command: 'show-page', page: 'upgrade' })}
                            appearance="primary"
                        />
                    )}
                    <ChatButtonComponent
                        label="Learn More"
                        action=""
                        onClick={() => postMessage({ command: 'show-page', page: 'rate-limits' })}
                        appearance="secondary"
                    />
                </div>
            )}
            <p className={styles.retryMessage}>{error.retryMessage}</p>
        </div>
    )
})
