import React from 'react'

import { ChatError, RateLimitError } from '@sourcegraph/cody-shared'

import { ChatButtonProps } from '../Chat'

import styles from './ErrorItem.module.css'

/**
 * An error message shown in the chat.
 */
export const ErrorItem: React.FunctionComponent<{
    error: string | ChatError
    ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
}> = React.memo(function ErrorItemContent({ error, ChatButtonComponent }) {
    return typeof error !== 'string' && error.name === RateLimitError.errorName ? (
        <RateLimitErrorItem error={error as RateLimitError} ChatButtonComponent={ChatButtonComponent} />
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
}> = React.memo(function RateLimitErrorItemContent({ error, ChatButtonComponent }) {
    return (
        <div className={styles.errorItem}>
            <h1>{error.upgradeIsAvailable ? 'Upgrade to Cody Pro' : 'Unable to Send Message'}</h1>
            <p>{error.userMessage}</p>
            {ChatButtonComponent && (
                <div className={styles.actions}>
                    {error.upgradeIsAvailable && (
                        <ChatButtonComponent
                            label="Upgrade"
                            action=""
                            onClick={() => {
                                // TODO(dantup): We don't have access to vsCodeApi to call postMessage here?
                                // vsCodeApi.postMessage({ command: 'show-page', page: 'upgrade')
                            }}
                            appearance="primary"
                        />
                    )}
                    <ChatButtonComponent
                        label="Learn More"
                        action=""
                        onClick={() => {
                            // TODO(dantup): We don't have access to vsCodeApi to call postMessage here?
                            // vsCodeApi.postMessage({ command: 'show-page', page: 'rate-limits')
                        }}
                        appearance="secondary"
                    />
                </div>
            )}
            <p className={styles.retryMessage}>{error.retryMessage}</p>
        </div>
    )
})
