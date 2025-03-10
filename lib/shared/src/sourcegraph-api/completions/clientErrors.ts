export type ErrorTransformer = (error: string, traceId?: string) => string | undefined

export interface TransformerEntry {
    transformer: ErrorTransformer
    priority: number // Higher numbers run later
}

/**
 * Namespace for transforming client-side error messages through a pipeline of registered transformers.
 */
export namespace ClientErrorsTransformer {
    const transformers: TransformerEntry[] = []

    /**
     * Register an error transformer with optional priority
     * @param transformer The transformer function
     * @param priority Higher values run later (default: 0, LAST_TRANSFORMER = 1000)
     */
    export function register(transformer: ErrorTransformer, priority = 0): void {
        transformers.push({ transformer, priority })
        // Sort transformers by priority after adding a new one
        transformers.sort((a, b) => a.priority - b.priority)
    }

    export const PRIORITIES = {
        FIRST: -1000,
        DEFAULT: 0,
        LAST: 1000,
    }

    /**
     * Transforms an error message by passing it through all registered transformers.
     * Each transformer can modify the result of previous transformers in a chain.
     * @param error - The original error message to transform
     * @returns The transformed error message
     */
    export function transform(error: string, traceId?: string): string {
        let result = error

        for (const entry of transformers) {
            const transformed = entry.transformer(result, traceId)
            if (transformed) {
                result = transformed
            }
        }

        return result
    }
}

const handleAUPTransform: ErrorTransformer = error => {
    if (error.includes('AUP')) {
        return error.split('"')[3]
    }
    return undefined
}

const handleMissingTraceIdTransform: ErrorTransformer = (error, traceId) => {
    if (traceId && !error.includes('AUP') && !error.includes(traceId)) {
        return error + ` (Sourcegraph error ID: ${traceId})`
    }
    return undefined
}

const handleContextDeadlineTransform: ErrorTransformer = error => {
    if (error.includes('context deadline exceeded')) {
        return 'Context deadline exceeded. Try again with a smaller context.'
    }
    return undefined
}

ClientErrorsTransformer.register(handleAUPTransform)
ClientErrorsTransformer.register(handleMissingTraceIdTransform, ClientErrorsTransformer.PRIORITIES.LAST)
ClientErrorsTransformer.register(handleContextDeadlineTransform)
