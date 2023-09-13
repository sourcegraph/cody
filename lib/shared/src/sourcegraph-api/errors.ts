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

export function isRateLimitError(error: Error): error is RateLimitError {
    return error instanceof RateLimitError
}

export class NetworkError extends Error {
    constructor(
        message: string,
        public traceId: string | undefined
    ) {
        super(message)
        Object.setPrototypeOf(this, NetworkError.prototype)
    }
}

export function isNetworkError(error: Error): error is NetworkError {
    return error instanceof NetworkError
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

export class AuthError extends Error {
    constructor(
        message: string,
        public traceId: string | undefined
    ) {
        super(message)
        Object.setPrototypeOf(this, AuthError.prototype)
    }
}

export function isAuthError(error: Error): error is AuthError {
    return error instanceof AuthError
}
