export class RateLimitError extends Error {
    constructor(
        message: string,
        public limit?: number,
        public retryAfter?: Date
    ) {
        super(message)
        Object.setPrototypeOf(this, RateLimitError.prototype)
    }
}

export function isAbortError(error: Error): boolean {
    return (
        // http module
        error.message === 'aborted' ||
        // fetch
        error.message.includes('The operation was aborted') ||
        error.message.includes('The user aborted a request')
    )
}

export function isRateLimitError(error: Error): boolean {
    return error instanceof RateLimitError
}
