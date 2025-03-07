export type ErrorTransformer = (error: string) => string | undefined

/**
 * Namespace for transforming client-side error messages through a pipeline of registered transformers.
 */
export namespace ClientErrorsTransformer {
    const transformers: ErrorTransformer[] = []

    export function register(transformer: ErrorTransformer): void {
        transformers.push(transformer)
    }

    /**
     * Transforms an error message by passing it through all registered transformers.
     * Returns the first transformed message that is not undefined, or the original error if no transformers match.
     * @param error - The original error message to transform
     * @returns The transformed error message
     */
    export function transform(error: string): string {
        for (const fn of transformers) {
            const result = fn(error)
            if (result) {
                return result
            }
        }
        return error
    }
}
const handleAUPError: ErrorTransformer = error => {
    if (error.includes('AUP')) {
        return error.split('"')[3]
    }
    return undefined
}

ClientErrorsTransformer.register(handleAUPError)
