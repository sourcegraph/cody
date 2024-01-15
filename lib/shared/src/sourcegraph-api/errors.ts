import { differenceInDays, format, formatDistanceStrict, formatRelative } from 'date-fns'

import { isError } from '../utils'

import { type BrowserOrNodeResponse } from './graphql/client'

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

    constructor(
        public readonly feature: 'autocompletions' | 'chat messages and commands',
        public readonly message: string,
        /* Whether an upgrade is available that would increase rate limits. */
        public readonly upgradeIsAvailable: boolean,
        public readonly limit?: number,
        /* The value of the `retry-after` header */
        public readonly retryAfter?: string | null
    ) {
        super(message)
        this.userMessage = `You've used all ${feature} for ${upgradeIsAvailable ? 'the month' : 'today'}.`
        this.retryAfterDate = retryAfter
            ? /^\d+$/.test(retryAfter)
                ? new Date(Date.now() + parseInt(retryAfter, 10) * 1000)
                : new Date(retryAfter)
            : undefined
        this.retryMessage = this.retryAfterDate ? formatRetryAfterDate(this.retryAfterDate) : undefined
    }
}

/*
For some reason `error instanceof RateLimitError` was not enough.
`isRateLimitError` returned `false` for some cases.
In particular, 'autocomplete/execute' in `agent.ts` and was affected.
It was required to add `(error as any)?.name === RateLimitError.errorName`.
 *  */
export function isRateLimitError(error: unknown): error is RateLimitError {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return error instanceof RateLimitError || (error as any)?.name === RateLimitError.errorName
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
        response: BrowserOrNodeResponse,
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

export class AbortError extends Error {
    // Added to make Typescript understand that AbortError is not the same as Error.
    public readonly isAbortError = true
}

export function isAbortError(error: unknown): error is AbortError {
    return (
        isError(error) &&
        // custom abort error
        ((error instanceof AbortError && error.isAbortError) ||
            // http module
            error.message === 'aborted' ||
            // fetch
            error.message.includes('The operation was aborted') ||
            error.message.includes('The user aborted a request'))
    )
}

export class TimeoutError extends Error {}

export class ContextWindowLimitError extends Error {
    public static readonly errorName = 'ContextWindowLimitError'
    public readonly name = ContextWindowLimitError.errorName

    constructor(public readonly message: string) {
        super(message)
    }
}
