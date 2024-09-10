
export interface ErrorLike {
    message: string
    name?: string
}

/**
 * Run the passed function and return `undefined` if it throws an error.
 */
export function tryCatch<T>(function_: () => T): T | undefined {
    try {
        return function_()
    } catch {
        return undefined
    }
}

export const isErrorLike = (value: unknown): value is ErrorLike =>
    typeof value === 'object' && value !== null && ('stack' in value || 'message' in value) && !('__typename' in value)
