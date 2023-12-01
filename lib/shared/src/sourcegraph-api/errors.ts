import { formatDistance } from 'date-fns'

import { isError } from '../utils'

export class RateLimitError extends Error {
    public static readonly errorName = 'RateLimitError'
    public readonly name = RateLimitError.errorName

    public readonly userMessage: string
    public readonly retryMessage: string | undefined

    constructor(
        public readonly feature: string,
        public readonly message: string,
        /**
         * Whether an upgrade is available that would increase rate limits.
         */
        public readonly upgradeIsAvailable: boolean,
        public readonly limit?: number,
        public readonly retryAfter?: Date
    ) {
        super(message)
        this.userMessage = `You've used all${limit ? ` ${limit}` : ''} ${feature} for today.`
        this.retryMessage = retryAfter ? `Usage will reset in ${formatDistance(retryAfter, new Date())}.` : undefined
    }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
    return error instanceof RateLimitError
}

export class TracedError extends Error {
    constructor(
        message: string,
        public traceId: string | undefined
    ) {
        super(message)
    }
}

export function isTracedError(error: Error): error is TracedError {
    return error instanceof TracedError
}

export class NetworkError extends Error {
    public readonly status: number

    constructor(
        response: Response,
        content: string,
        public traceId: string | undefined
    ) {
        super(`Request to ${response.url} failed with ${response.status} ${response.statusText}: ${content}`)
        this.status = response.status
    }
}

export function isNetworkError(error: Error): error is NetworkError {
    return error instanceof NetworkError
}

export function isAuthError(error: unknown): boolean {
    return error instanceof NetworkError && (error.status === 401 || error.status === 403)
}

export class AbortError extends Error {}

export function isAbortError(error: unknown): boolean {
    return (
        isError(error) &&
        // custom abort error
        (error instanceof AbortError ||
            // http module
            error.message === 'aborted' ||
            // fetch
            error.message.includes('The operation was aborted') ||
            error.message.includes('The user aborted a request'))
    )
}

export class TimeoutError extends Error {}
