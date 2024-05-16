import {
    type BrowserOrNodeResponse,
    type ConfigurationWithAccessToken,
    addCustomUserAgent,
    addTraceparent,
    dotcomTokenToGatewayToken,
    isDotCom,
    logDebug,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { fetch } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'

// We choose an interval that gives us a reasonable aggregate without causing
// too many requests
const PING_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * A provider that regularly pings the connected Sourcegraph instance to
 * understand the latencies between the client and the instance.
 *
 * You can query it to get aggregates of the most recent pings.
 */
export class UpstreamHealthProvider implements vscode.Disposable {
    private lastUpstreamLatency?: number
    private lastGatewayLatency?: number
    private fastPathAccessToken?: string

    private config: Pick<
        ConfigurationWithAccessToken,
        'serverEndpoint' | 'customHeaders' | 'accessToken'
    > | null = null
    private nextTimeoutId: NodeJS.Timeout | null = null

    public getUpstreamLatency(): number | undefined {
        if (!this.config) {
            return undefined
        }
        return this.lastUpstreamLatency
    }

    public getGatewayLatency(): number | undefined {
        if (!this.config) {
            return undefined
        }
        return this.lastGatewayLatency
    }

    public onConfigurationChange(
        newConfig: Pick<ConfigurationWithAccessToken, 'serverEndpoint' | 'customHeaders' | 'accessToken'>
    ): this {
        this.config = newConfig
        this.lastUpstreamLatency = undefined
        this.lastGatewayLatency = undefined

        this.fastPathAccessToken =
            newConfig.accessToken &&
            // Require the upstream to be dotcom
            isDotCom(newConfig.serverEndpoint)
                ? dotcomTokenToGatewayToken(newConfig.accessToken)
                : undefined

        this.measure()
        return this
    }

    private async measure() {
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }

        try {
            if (!this.config) {
                throw new Error('UpstreamHealthProvider not initialized')
            }

            const headers = new Headers(this.config.customHeaders as HeadersInit)
            headers.set('Content-Type', 'application/json; charset=utf-8')
            if (this.config.accessToken) {
                headers.set('Authorization', `token ${this.config.accessToken}`)
            }
            addTraceparent(headers)
            addCustomUserAgent(headers)
            const url = new URL('/healthz', this.config.serverEndpoint)
            const upstreamResult = await wrapInActiveSpan('upstream-latency.upstream', span => {
                span.setAttribute('sampled', true)
                return measureLatencyToUri(headers, url.toString())
            })

            // We don't want to congest the network so we run the test in serial
            if (this.fastPathAccessToken) {
                const headers = new Headers()
                headers.set('Content-Type', 'application/json; charset=utf-8')
                headers.set('Authorization', `Bearer ${this.fastPathAccessToken}`)
                addTraceparent(headers)
                addCustomUserAgent(headers)
                const uri = 'https://cody-gateway.sourcegraph.com/healthz'
                const gatewayResult = await wrapInActiveSpan('upstream-latency.gateway', span => {
                    span.setAttribute('sampled', true)
                    return measureLatencyToUri(headers, uri)
                })
                if (!('error' in gatewayResult)) {
                    this.lastGatewayLatency = gatewayResult.latency
                }
            }

            if ('error' in upstreamResult) {
                this.lastUpstreamLatency = undefined

                logDebug('UpstreamHealth', 'Failed to ping upstream host', {
                    verbose: {
                        error: upstreamResult.error,
                    },
                })
            } else {
                this.lastUpstreamLatency = upstreamResult.latency

                logDebug(
                    'UpstreamHealth',
                    `Ping took ${Math.round(upstreamResult.latency)}ms ${
                        this.lastGatewayLatency
                            ? `(Gateway: ${Math.round(this.lastGatewayLatency)}ms)`
                            : ''
                    }`,
                    {
                        verbose: {
                            Latency: upstreamResult.latency,
                            url,
                            status: upstreamResult.response.status,
                            headers: headersToObject(upstreamResult.response.headers),
                        },
                    }
                )
            }
        } catch (error) {
            // We don't care about errors here, we just want to measure the latency
        } finally {
            // Enqueue a new ping
            if (this.nextTimeoutId) {
                clearTimeout(this.nextTimeoutId)
            }
            this.nextTimeoutId = setTimeout(this.measure.bind(this), PING_INTERVAL_MS)
        }
    }

    public dispose(): void {
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }
    }
}

export const upstreamHealthProvider = new UpstreamHealthProvider()

function headersToObject(headers: BrowserOrNodeResponse['headers']) {
    const result: Record<string, string> = {}
    for (const [key, value] of headers.entries()) {
        result[key] = value
    }
    return result
}

async function measureLatencyToUri(
    headers: Headers,
    uri: string
): Promise<{ latency: number; response: BrowserOrNodeResponse } | { error: Error }> {
    try {
        const start = performance.now()
        // We use a GET request even though we do not want to consume the
        // body to avoid internal networks interfering with the request.
        //
        // To make sure the content is garbage collected, we'll ensure that
        // the body is consumed. We don't use undici yet but that might
        // change in the future:
        //
        // https://undici.nodejs.org/#/?id=garbage-collection
        const response = await fetch(uri, { method: 'GET', headers })
        void response.arrayBuffer() // consume the body
        return { latency: performance.now() - start, response }
    } catch (error: any) {
        return { error }
    }
}
