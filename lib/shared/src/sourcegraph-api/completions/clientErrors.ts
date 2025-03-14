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
        // Get all strings between quotes
        const matches = error.match(/"([^"]*)"/g)
        if (matches && matches.length > 0) {
            // Get the last quoted string and remove the quotes
            return matches[matches.length - 1].replace(/"/g, '')
        }
    }
    return undefined
}

const handleCloudflareTransform: ErrorTransformer = error => {
    if (error.includes('Sorry, you have been blocked')) {
        return `Cloudflare has blocked this request.
                This may be due to using a VPN or other non-trusted network deemed dangerous.
                Please try again without using such a network.`
    }
    return undefined
}

const handleMissingTraceIdTransform: ErrorTransformer = (error, traceId) => {
    if (traceId && !error.includes('AUP') && !error.includes(traceId)) {
        return error + ` (Error ID: ${traceId})`
    }
    return undefined
}

const handleContextDeadlineTransform: ErrorTransformer = error => {
    if (error.includes('context deadline exceeded')) {
        return 'Context deadline exceeded. Please try again with a smaller context.'
    }
    return undefined
}

const handleNetworkErrorTransform: ErrorTransformer = error => {
    // Match the pattern from "Request to [url] failed with" format
    // used by errors.ts NetworkError
    const match = error.match(/Request to .+? failed with (.+)/i)
    if (match?.[1]) {
        return match[1].trim()
    }
    return undefined
}
const handleMessageTransform: ErrorTransformer = error => {
    // Check for patterns that indicate a JSON structure with error information
    if (
        (error.includes('Sourcegraph Cody Gateway:') || error.includes('"error":')) &&
        error.includes('"message":')
    ) {
        // regex to extract the message from JSON-like structure
        const match = error.match(/"message":\s*"([^"]+)"/)
        if (match?.[1]) {
            return match[1]
        }
    }
    return undefined
}

const handleRateLimitTransform: ErrorTransformer = error => {
    if (error.includes('exceeded the rate limit')) {
        const match = error.match(/exceeded the rate limit of (\d+) requests. Retry after (.+)/)
        if (match?.[2]) {
            const retryAfter = match[2]
            const retryDate = new Date(retryAfter)
            const formattedDate = retryDate.toUTCString()
            const simplifiedErrorMessage = `You have exceeded the rate limit of ${match[1]} requests. Retry after ${formattedDate}`
            return simplifiedErrorMessage
        }
    }
    return undefined
}

const handleFetchSubscriptionTransform: ErrorTransformer = error => {
    if (error.includes('ENHANCE_YOUR_CALM')) {
        return 'Error fetching subscription. Please try again later.'
    }
    return undefined
}

const handleOrganizationTokenLimit: ErrorTransformer = error => {
    if (error.includes('This request would exceed your organization')) {
        return 'Upstream service error.'
    }
    return undefined
}

ClientErrorsTransformer.register(handleAUPTransform)
ClientErrorsTransformer.register(handleCloudflareTransform)
ClientErrorsTransformer.register(handleMissingTraceIdTransform, ClientErrorsTransformer.PRIORITIES.LAST)
ClientErrorsTransformer.register(handleContextDeadlineTransform)
ClientErrorsTransformer.register(handleRateLimitTransform)
ClientErrorsTransformer.register(handleNetworkErrorTransform)
ClientErrorsTransformer.register(handleFetchSubscriptionTransform)
ClientErrorsTransformer.register(handleOrganizationTokenLimit)
ClientErrorsTransformer.register(handleMessageTransform)
