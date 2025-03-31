import { handleRateLimitError as syncHandleRateLimitError } from './models/sync'
import { type RateLimitError, isRateLimitError } from './sourcegraph-api/errors'

/**
 * Centralized handler for all errors
 * @param error The error to handle
 * @returns The original error for further handling
 */
export function handleError(error: Error, feature: string): Error {
    console.log(
        '[julia] handleError in error-handler.ts ---- All regular (non-fast) models due to rate limiting'
    )

    // If it's a rate limit error, handle it in sync.ts
    if (isRateLimitError(error)) {
        syncHandleRateLimitError(error as RateLimitError, feature)
    }

    // Return the original error for further handling
    return error
}
