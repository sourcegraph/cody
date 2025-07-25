import React, { useCallback, useMemo } from 'react'

import { type ChatError, FeatureFlag, RateLimitError } from '@sourcegraph/cody-shared'
import type { ApiPostMessage } from '../Chat'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/shadcn/ui/tooltip'
import type {
    HumanMessageInitialContextInfo as InitialContextInfo,
    PriorHumanMessageInfo,
} from './cells/messageCell/assistant/AssistantMessageCell'

import { Button } from '../components/shadcn/ui/button'
import { createWebviewTelemetryRecorder } from '../utils/telemetry'
import { useFeatureFlag } from '../utils/useFeatureFlags'
import styles from './ErrorItem.module.css'

/**
 * An error message shown in the chat.
 */
export const ErrorItem: React.FunctionComponent<{
    error: Omit<ChatError, 'isChatErrorGuard'>
    postMessage?: ApiPostMessage
    humanMessage?: PriorHumanMessageInfo | null
}> = ({ error, postMessage, humanMessage }) => {
    if (typeof error !== 'string' && error.name === RateLimitError.errorName && postMessage) {
        return <RateLimitErrorItem error={error as RateLimitError} postMessage={postMessage} />
    }
    return <RequestErrorItem error={error} humanMessage={humanMessage} />
}

/**
 * Renders a generic error message for chat request failures.
 */
export const RequestErrorItem: React.FunctionComponent<{
    error: Error | string
    humanMessage?: PriorHumanMessageInfo | null
}> = ({ error, humanMessage }) => {
    const errorMessage = typeof error === 'string' ? error : error.message || 'Unknown error'
    const isApiVersionError = errorMessage.includes('unable to determine Cody API version')

    const actions =
        isApiVersionError && humanMessage
            ? [
                  {
                      label: 'Try again',
                      tooltip: 'Retry request without code context',
                      onClick: () => {
                          const options: InitialContextInfo = {
                              repositories: false,
                              files: false,
                          }
                          humanMessage.rerunWithDifferentContext(options)
                      },
                  },
              ]
            : []

    return (
        <div className={styles.requestError}>
            <div className={styles.errorContent}>
                <span className={styles.requestErrorTitle}>Request Failed: </span>
                {errorMessage}
            </div>
            {actions.length > 0 && (
                <menu className="tw-flex tw-gap-2 tw-text-sm tw-text-muted-foreground">
                    <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-x-4 tw-gap-y-2">
                        <ul className="tw-whitespace-nowrap tw-flex tw-gap-2 tw-flex-wrap">
                            {actions.map(({ label, tooltip, onClick }) => (
                                <li key={label}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="outline" size="sm" onClick={onClick}>
                                                {label}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{tooltip}</TooltipContent>
                                    </Tooltip>
                                </li>
                            ))}
                        </ul>
                    </div>
                </menu>
            )}
        </div>
    )
}
/**
 * An error message shown in the chat.
 */
const RateLimitErrorItem: React.FunctionComponent<{
    error: RateLimitError
    postMessage: ApiPostMessage
}> = ({ error, postMessage }) => {
    // Only show Upgrades if both the error said an upgrade was available and we know the user
    // has not since upgraded.
    const isEnterpriseUser = true
    const canUpgrade = error.upgradeIsAvailable
    const tier = isEnterpriseUser ? 'enterprise' : canUpgrade ? 'free' : 'pro'
    const telemetryRecorder = useMemo(() => createWebviewTelemetryRecorder(postMessage), [postMessage])

    // Only log once on mount
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only logs once on mount
    React.useEffect(() => {
        // Log as abuseUsageLimit if pro user run into rate limit
        telemetryRecorder.recordEvent(
            canUpgrade ? 'cody.upsellUsageLimitCTA' : 'cody.abuseUsageLimitCTA',
            'shown',
            {
                privateMetadata: {
                    limit_type: 'chat_commands',
                    tier,
                },
            }
        )
    }, [telemetryRecorder])

    const onButtonClick = useCallback(
        (page: 'upgrade' | 'rate-limits', call_to_action: 'upgrade' | 'learn-more'): void => {
            // Log click event
            telemetryRecorder.recordEvent('cody.upsellUsageLimitCTA', 'clicked', {
                privateMetadata: {
                    limit_type: 'chat_commands',
                    call_to_action,
                    tier,
                },
            })

            // open the page in browser
            postMessage({ command: 'show-page', page })
        },
        [postMessage, tier, telemetryRecorder]
    )

    let ctaText = 'Unable to Send Message'

    const fallbackToFlash = useFeatureFlag(FeatureFlag.FallbackToFlash)

    if (fallbackToFlash) {
        ctaText = 'Usage limit of premium models reached, switching the model to Gemini Flash.'
    }

    return (
        <div className={styles.errorItem}>
            <div className={styles.body}>
                <header>
                    <h1>{ctaText}</h1>
                    <p>
                        {error.userMessage}
                        {fallbackToFlash &&
                            ' You can continue using Gemini Flash, or other standard models.'}
                    </p>
                </header>
                <div className={styles.actions}>
                    {error.feature !== 'Agentic Chat' && (
                        <Button
                            type="button"
                            onClick={() => onButtonClick('rate-limits', 'learn-more')}
                            variant="secondary"
                        >
                            Learn More
                        </Button>
                    )}
                </div>
                {error.retryMessage && <p className={styles.retryMessage}>{error.retryMessage}</p>}
            </div>
        </div>
    )
}
