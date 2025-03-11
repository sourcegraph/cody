import { promises as dns } from 'node:dns'
import { performance } from 'node:perf_hooks'
import { URL } from 'node:url'
import { type Message, type PromptString, charsToTokens } from '@sourcegraph/cody-shared'
import { fetch, globalAgentRef, requestTracker } from '@sourcegraph/cody-shared'
import { NetworkTimingCollector } from '../../net/NetworkTiming'

export interface FireworksCompatibleRequestParams {
    stream: boolean
    model: string
    temperature: number
    max_tokens: number
    response_format: {
        type: string
    }
    prediction: {
        type: string
        content: string
    }
    rewrite_speculation?: boolean
    user?: string
}

export interface FireworksChatMessage {
    role: string
    content: PromptString
}

export interface FireworksChatModelRequestParams extends FireworksCompatibleRequestParams {
    messages: FireworksChatMessage[]
}

export interface FireworksCompletionModelRequestParams extends FireworksCompatibleRequestParams {
    prompt: PromptString
}

export type AutoeditsRequestBody =
    | FireworksChatModelRequestParams
    | FireworksCompletionModelRequestParams

export function getMaxOutputTokensForAutoedits(codeToRewrite: string): number {
    const MAX_NEW_GENERATED_TOKENS = 512
    const codeToRewriteTokens = charsToTokens(codeToRewrite.length)
    return codeToRewriteTokens + MAX_NEW_GENERATED_TOKENS
}

export function getOpenaiCompatibleChatPrompt(param: {
    systemMessage?: PromptString
    userMessage: PromptString
}): { role: string; content: PromptString }[] {
    const prompt = []
    if (param.systemMessage) {
        prompt.push({ role: 'system', content: param.systemMessage })
    }
    prompt.push({ role: 'user', content: param.userMessage })
    return prompt
}

export function getSourcegraphCompatibleChatPrompt(param: {
    systemMessage: PromptString | undefined
    userMessage: PromptString
}): Message[] {
    const prompt: Message[] = []
    if (param.systemMessage) {
        prompt.push({ speaker: 'system', text: param.systemMessage })
    }
    prompt.push({ speaker: 'human', text: param.userMessage })
    return prompt
}

// Cache for storing resolved IP addresses
export const dnsCache: Record<string, { ip: string; expiry: number }> = {}
const DNS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds

// Metrics for DNS resolution
export const dnsMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    resolutionErrors: 0,
    totalResolutionTimeMs: 0,
    resolutionCount: 0,

    // Calculate average resolution time
    get averageResolutionTimeMs(): number {
        return this.resolutionCount === 0 ? 0 : this.totalResolutionTimeMs / this.resolutionCount
    },

    // Get cache hit rate as percentage
    get cacheHitRate(): number {
        const total = this.cacheHits + this.cacheMisses
        return total === 0 ? 0 : (this.cacheHits / total) * 100
    },

    // Log current metrics
    logMetrics(): void {
        console.log('DNS Cache Metrics:')
        console.log(`- Cache hit rate: ${this.cacheHitRate.toFixed(2)}%`)
        console.log(`- Cache hits: ${this.cacheHits}`)
        console.log(`- Cache misses: ${this.cacheMisses}`)
        console.log(`- Resolution errors: ${this.resolutionErrors}`)
        console.log(`- Average resolution time: ${this.averageResolutionTimeMs.toFixed(2)}ms`)
    },

    // Reset all metrics
    resetMetrics(): void {
        this.cacheHits = 0
        this.cacheMisses = 0
        this.resolutionErrors = 0
        this.totalResolutionTimeMs = 0
        this.resolutionCount = 0
    },
}

/**
 * Resolves a hostname to an IP address and caches the result
 */
export async function resolveAndCacheHostname(hostname: string): Promise<string> {
    const now = Date.now()

    // Return from cache if available and not expired
    if (dnsCache[hostname] && dnsCache[hostname].expiry > now) {
        dnsMetrics.cacheHits++
        return dnsCache[hostname].ip
    }

    // Cache miss
    dnsMetrics.cacheMisses++

    try {
        // Measure DNS resolution time
        const startTime = performance.now()

        // Resolve hostname to IP addresses (returns an array)
        const addresses = await dns.resolve4(hostname)

        // Calculate and record resolution time
        const endTime = performance.now()
        dnsMetrics.totalResolutionTimeMs += endTime - startTime
        dnsMetrics.resolutionCount++

        if (addresses && addresses.length > 0) {
            // Cache the first IP with an expiry time
            dnsCache[hostname] = {
                ip: addresses[0],
                expiry: now + DNS_CACHE_TTL,
            }
            return addresses[0]
        }
    } catch (error) {
        // Record resolution error
        dnsMetrics.resolutionErrors++

        // If DNS resolution fails, log error and let the fetch proceed normally
        console.error(`DNS resolution failed for ${hostname}:`, error)
    }

    // Return the original hostname if resolution fails
    return hostname
}

/**
 * Pre-resolves a hostname and stores it in cache without trying to use the IP directly
 */
export async function prewarmDnsCache(hostname: string): Promise<void> {
    try {
        await resolveAndCacheHostname(hostname)
    } catch (error) {
        console.error(`Failed to prewarm DNS cache for ${hostname}:`, error)
    }
}

export async function getModelResponse(
    url: string,
    body: string,
    apiKey: string,
    customHeaders: Record<string, string> = {},
    externalStartTime?: number
): Promise<{
    data: any
    requestHeaders: Record<string, string>
    responseHeaders: Record<string, string>
    url: string
    timingInfo?: any // Add timing info to return type
}> {
    const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...customHeaders,
    }

    // Parse the URL to get hostname
    const parsedUrl = new URL(url)
    const originalHostname = parsedUrl.hostname

    // Pre-resolve the hostname and cache it for future use
    try {
        // Fire and forget - we don't wait for this to complete
        prewarmDnsCache(originalHostname).catch(() => {
            /* ignore errors */
        })
    } catch {
        // Ignore any errors in DNS prewarm
    }

    // Track if we're measuring the timing manually or via DelegatingAgent
    let requestId: string | undefined
    let manualTiming = true
    const startTime = performance.now()

    try {
        // Use the original URL for the fetch since direct IP connection causes SSL issues with Cloudflare
        const response = await fetch(url, {
            method: 'POST',
            headers: requestHeaders,
            body: body,
        })

        // Get the request ID directly from the response object where we attached it
        requestId = (response as any)._codyRequestId

        // If we don't have a request ID directly on the response, try the request tracker
        if (!requestId) {
            const trackingInfo = requestTracker.get(response)
            if (trackingInfo) {
                requestId = trackingInfo.id
            }
        }

        // If we have a request ID from either source, we're not doing manual timing
        if (requestId) {
            manualTiming = false
        }

        if (response.status !== 200) {
            const errorText = await response.text()
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`)
        }

        // Extract headers into a plain object
        const responseHeaders: Record<string, string> = {}
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value
        })

        const data = await response.json()

        // Get timing information
        let timingInfo: any

        if (!manualTiming && requestId && globalAgentRef.agent && globalAgentRef.isSet) {
            // Finalize the timing data with the status code using type assertion
            // The DelegatingAgent has this method but TypeScript doesn't know about it
            timingInfo = (globalAgentRef.agent as any).finalizeRequestTiming(requestId, response.status)
            console.log({ timingInfo, startTime, externalStartTime })

            if (timingInfo) {
                console.log(NetworkTimingCollector.formatTimingReport(timingInfo))
            }
        } else {
            // Manual timing if DelegatingAgent wasn't used
            const endTime = performance.now()

            // Get tracking info for manual timing details
            const trackingInfoForTiming = requestTracker.get(response)

            if (trackingInfoForTiming) {
                timingInfo = {
                    totalTime: endTime - trackingInfoForTiming.startTime,
                    url: trackingInfoForTiming.url,
                    method: trackingInfoForTiming.method,
                    statusCode: response.status,
                    requestStart: trackingInfoForTiming.startTime,
                    requestEnd: endTime,
                    note: 'Basic timing via request tracker',
                }
            } else {
                timingInfo = {
                    totalTime: endTime - startTime,
                    url,
                    method: 'POST',
                    statusCode: response.status,
                    requestStart: startTime,
                    requestEnd: endTime,
                    note: 'Limited timing available - request tracking failed',
                }
            }

            console.log(
                '⚠️ Limited network timing available:\n⏱️ Total request time: ' +
                    timingInfo.totalTime.toFixed(2) +
                    'ms'
            )
            console.log(
                '🔍 Note: For detailed DNS and connection metrics, ensure DelegatingAgent is used for network requests.'
            )
        }

        // Clean up the tracker to prevent memory leaks
        requestTracker.delete(response)

        return { data, requestHeaders, responseHeaders, url, timingInfo }
    } catch (error) {
        // If we have a requestId, finalize the timing to record the error
        if (requestId && globalAgentRef.isSet && globalAgentRef.agent) {
            // Type assertion for the method
            const timingInfo = (globalAgentRef.agent as any).finalizeRequestTiming(requestId, 0)
            if (timingInfo) {
                console.error('Network request failed with timing information:')
                console.log(NetworkTimingCollector.formatTimingReport(timingInfo))
            }
        }
        throw error
    }
}
