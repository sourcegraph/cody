import { differenceInDays, format, formatDistanceStrict, formatRelative } from 'date-fns'

import { isError } from '../utils'

import type { BrowserOrNodeResponse } from './graphql/client'

function formatRetryAfterDate(retryAfterDate: Date): string {
    const now = new Date()
    if (differenceInDays(retryAfterDate, now) < 7) {
        return `Usage will reset ${formatRelative(retryAfterDate, now)}`
    }
    return `Usage will reset in ${formatDistanceStrict(retryAfterDate, now)} (${format(
        retryAfterDate,
        'P'
    )} at ${format(retryAfterDate, 'p')})`
}

export class RateLimitError extends Error {
    public static readonly errorName = 'RateLimitError'
    public readonly name = RateLimitError.errorName

    public readonly userMessage: string
    public readonly retryAfterDate: Date | undefined
    public readonly retryMessage: string | undefined
    private modelReenableTimeout?: NodeJS.Timeout

    constructor(
        public readonly feature: 'autocompletions' | 'chat messages and commands' | 'Agentic Chat',
        public readonly message: string,
        /* Whether an upgrade is available that would increase rate limits. */
        public readonly upgradeIsAvailable: boolean,
        public readonly limit?: number,
        /* The value of the `retry-after` header */
        public readonly retryAfter?: string | null
    ) {
        super(message)
        this.userMessage =
            feature === 'Agentic Chat'
                ? `You've reached the daily limit for agentic context (experimental). You can continue using Gemini Flash, or other standard models. `
                : `You've used all of your ${feature} for ${
                      upgradeIsAvailable ? 'the month' : 'today'
                  }. You can continue using Gemini Flash, or other standard models. `
        this.retryAfterDate = retryAfter
            ? /^\d+$/.test(retryAfter)
                ? new Date(Date.now() + Number.parseInt(retryAfter, 10) * 1000)
                : new Date(retryAfter)
            : undefined
        this.retryMessage = this.retryAfterDate ? formatRetryAfterDate(this.retryAfterDate) : undefined
        
        // Schedule model re-enable when retry time is reached
        if (this.retryAfterDate) {
            this.scheduleModelReenableOnRetry();
        }
    }
    
    /**
     * Schedules a task to re-enable models when the retry-after time is reached.
     * This ensures that models are automatically re-enabled once the rate limit period expires.
     */
    private scheduleModelReenableOnRetry(): void {
        if (!this.retryAfterDate) {
            return;
        }
        
        const now = new Date();
        const timeToWait = Math.max(0, this.retryAfterDate.getTime() - now.getTime());
        
        // Clear any existing timeout to avoid multiple handlers
        if (this.modelReenableTimeout) {
            clearTimeout(this.modelReenableTimeout);
        }
        
        // Set a timeout to re-enable models when the retry period expires
        this.modelReenableTimeout = setTimeout(() => {
            this.reenableModels();
        }, timeToWait);
    }
    
    /**
     * Re-enables all models that were disabled due to rate limiting.
     * This is called automatically when the retry-after period expires.
     */
    private reenableModels(): void {
        console.log(`[Cody] Rate limit period expired for ${this.feature}. Re-enabling models.`);
        
        // For Agentic Chat feature, we need to reset the rate limit in the ToolboxManager
        if (this.feature === 'Agentic Chat' && typeof require !== 'undefined') {
            try {
                // Dynamically import to avoid circular dependencies
                const { toolboxManager } = require('../../vscode/src/chat/agentic/ToolboxManager');
                if (toolboxManager) {
                    toolboxManager.setIsRateLimited(false);
                    console.log('[Cody] Successfully re-enabled DeepCody models in ToolboxManager');
                }
            } catch (error) {
                console.error('[Cody] Failed to re-enable models in ToolboxManager:', error);
            }
        }
        
        // Update the authStatus to remove the rate limit for this feature
        try {
            const { currentAuthStatusOrNotReadyYet, mockAuthStatus } = require('../auth/authStatus');
            const currentStatus = currentAuthStatusOrNotReadyYet();
            if (currentStatus?.authenticated && currentStatus.rateLimited) {
                // Create a new auth status object with the rate limit for this feature removed
                const updatedRateLimited = { ...currentStatus.rateLimited };
                delete updatedRateLimited[this.feature];
                
                // If there are no more rate limited features, remove the rateLimited property entirely
                const updatedStatus: typeof currentStatus = {
                    ...currentStatus,
                    rateLimited: Object.keys(updatedRateLimited).length > 0 ? updatedRateLimited : undefined,
                };
                
                console.log(`[Cody] Updating auth status to remove rate limit for ${this.feature}`);
                mockAuthStatus(updatedStatus);
                
                // This will trigger syncModels to re-enable the models since the authStatus has changed
                console.log('[Cody] Auth status updated, models will be re-enabled via syncModels');
            }
        } catch (error) {
            console.error('[Cody] Failed to update auth status to remove rate limit:', error);
        }
        
        // Emit an event that can be listened to by various components
        // to re-enable their models
        if (typeof window !== 'undefined') {
            const event = new CustomEvent('cody:rate-limit-expired', {
                detail: {
                    feature: this.feature,
                    timestamp: new Date(),
                }
            });
            window.dispatchEvent(event);
        } else if (typeof process !== 'undefined') {
            // For Node.js environments, use EventEmitter pattern
            // We need to use a proper Node.js event emitter
            // This will need to be handled by components that want to listen for this event
            console.log(`[Cody] Rate limit period expired for ${this.feature}. Components should check for re-enabling.`);
            // Notify any listeners through a global event bus if available
            if (typeof global !== 'undefined' && (global as any).codyEventBus) {
                (global as any).codyEventBus.emit('rate-limit-expired', {
                    feature: this.feature,
                    timestamp: new Date(),
                });
            }
        }
    }
}

/*
For some reason `error instanceof RateLimitError` was not enough.
`isRateLimitError` returned `false` for some cases.
In particular, 'autocomplete/execute' in `agent.ts` and was affected.
It was required to add `(error as any)?.name === RateLimitError.errorName`.
 *  */
export function isRateLimitError(error: unknown): error is RateLimitError {
    return error instanceof RateLimitError || (error as any)?.name === RateLimitError.errorName
}

export function isContextWindowLimitError(error: unknown): error is Error {
    return error instanceof Error && error.message.includes('token limit')
}

export class TracedError extends Error {
    constructor(
        message: string,
        public traceId: string | undefined
    ) {
        super(message)
    }
}

export class NetworkError extends Error {
    public readonly status: number

    constructor(
        response: Pick<BrowserOrNodeResponse, 'url' | 'status' | 'statusText'>,
        content: string,
        public traceId: string | undefined
    ) {
        super(
            `Request to ${response.url} failed with ${response.status} ${response.statusText}: ${content}`
        )
        this.status = response.status
    }
}

export function isNetworkError(error: Error): error is NetworkError {
    return error instanceof NetworkError
}

export function isAuthError(error: unknown): error is AuthError | NetworkError {
    return (
        (error instanceof NetworkError && (error.status === 401 || error.status === 403)) ||
        error instanceof AuthError
    )
}

export class AbortError extends Error {
    // Added to make TypeScript understand that AbortError is not the same as Error.
    public readonly isAbortError = true
}

export function isAbortError(error: unknown): error is AbortError {
    return (
        isError(error) &&
        // custom abort error
        ((error instanceof AbortError && error.isAbortError) ||
            error.name === 'AbortError' ||
            ('type' in error && error.type === 'aborted') ||
            // http module
            error.message === 'aborted' ||
            // fetch
            error.message.includes('The operation was aborted') ||
            error.message === 'This operation was aborted' ||
            error.message.includes('The user aborted a request'))
    )
}

export function isAbortErrorOrSocketHangUp(error: unknown): error is Error {
    return Boolean(
        isAbortError(error) ||
            (error && (error as any).message === 'socket hang up') ||
            (error && (error as any).message === 'aborted') ||
            error === 'aborted'
    )
}

export class TimeoutError extends Error {}

export function isNetworkLikeError(error: Error): boolean {
    const message = error.message
    return (
        message.includes('ENOTFOUND') ||
        message.includes('ECONNREFUSED') ||
        message.includes('ECONNRESET') ||
        message.includes('EHOSTUNREACH') ||
        message.includes('ETIMEDOUT') ||
        message.includes('SELF_SIGNED_CERT_IN_CHAIN')
    )
}

export class AuthError extends Error {
    public title: string
    public content: string
    public showTryAgain = false

    constructor(title: string, content: string) {
        super(`${title}: ${content}`)
        this.content = content
        this.title = title
    }
}

/**
 * An error representing the condition where the endpoint is not available due to lack of network
 * connectivity, server downtime, or other configuration issues *unrelated to* the validity of the
 * credentials.
 */
export class AvailabilityError extends AuthError {
    constructor() {
        super('Network Error', 'Sourcegraph is unreachable')
        this.showTryAgain = true
    }
}

export class InvalidAccessTokenError extends AuthError {
    constructor() {
        super('Invalid Access Token', 'The access token is invalid or has expired')
    }
}

export class EnterpriseUserDotComError extends AuthError {
    constructor(enterprise: string) {
        super(
            'Enterprise User Authentication Error',
            'Based on your email address we think you may be an employee of ' +
                `${enterprise}. To get access to all your features please sign ` +
                "in through your organization's enterprise instance instead. If you need assistance " +
                'please contact your Sourcegraph admin.'
        )
    }
}

export class AuthConfigError extends AuthError {
    constructor(message: string) {
        super('Auth Config Error', message)
    }
}

export class ExternalAuthProviderError extends AuthError {
    constructor(message: string) {
        super('External Auth Provider Error', message)
    }
}

/**
 * An error indicating that the user needs to complete an authentication challenge.
 */
export class NeedsAuthChallengeError extends AuthError {
    constructor() {
        // See
        // https://linear.app/sourcegraph/issue/CODY-4695/handle-customer-proxy-re-auth-response-by-retrying-not-prompting-user
        // for an explanation of this message. If you need to change it to something more general,
        // consult the customers mentioned in that issue.
        super(
            'Tap Your YubiKey to Authenticate',
            `Your device's authentication expired and must be renewed to access Sourcegraph on your organization's network.`
        )
    }
}

export function isExternalProviderAuthError(error: unknown): error is ExternalAuthProviderError {
    return error instanceof ExternalAuthProviderError
}

export function isNeedsAuthChallengeError(error: unknown): error is NeedsAuthChallengeError {
    return error instanceof NeedsAuthChallengeError
}

export function isAvailabilityError(error: unknown): error is AvailabilityError {
    return error instanceof AvailabilityError
}

export function isInvalidAccessTokenError(error: unknown): error is InvalidAccessTokenError {
    return error instanceof InvalidAccessTokenError
}

export function isEnterpriseUserDotComError(error: unknown): error is EnterpriseUserDotComError {
    return error instanceof EnterpriseUserDotComError
}
