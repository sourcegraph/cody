import {
    type BrowserOrNodeResponse,
    type ConfigurationWithAccessToken,
    addCustomUserAgent,
    addTraceparent,
    logDebug,
} from '@sourcegraph/cody-shared'
import { fetch } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'

// We choose an interval that gives us a reasonable aggregate without causing
// too many requests
export const PING_INTERVAL = 10 * 60 * 1000 // 10 minutes

/**
 * A provider that regularly pings the connected Sourcegraph instance to
 * understand the latencies between the client and the instance.
 *
 * You can query it to get aggregates of the most recent pings.
 */
export class UpstreamHealthProvider implements vscode.Disposable {
    private config: Pick<
        ConfigurationWithAccessToken,
        'serverEndpoint' | 'customHeaders' | 'accessToken'
    > | null = null
    private recentDurations: { timestamp: number; duration: number }[] = []
    private nextTimeoutId: NodeJS.Timeout | null = null

    public getMedianDuration(): number | undefined {
        if (!this.config) {
            throw new Error('UpstreamHealthProvider not initialized')
        }
        if (this.recentDurations.length === 0) {
            return undefined
        }
        const sorted = this.recentDurations.sort((a, b) => a.duration - b.duration)
        return sorted[Math.floor(sorted.length / 2)].duration
    }

    public onConfigurationChange(
        newConfig: Pick<ConfigurationWithAccessToken, 'serverEndpoint' | 'customHeaders' | 'accessToken'>
    ): this {
        this.config = newConfig
        this.recentDurations = []
        this.measure()
        return this
    }

    private async measure() {
        console.log('measure')
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }

        const start = Date.now()
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

            // We use a HEAD request since we do not want to consume the body
            // and do not want to have the request garbage-collected.
            //
            // https://undici.nodejs.org/#/?id=garbage-collection
            const response = await fetch(url.toString(), { method: 'HEAD', headers })

            const duration = Date.now() - start
            this.recentDurations.push({ timestamp: Date.now(), duration })
            // Delete items that are older than 2 hours
            this.recentDurations = this.recentDurations.filter(
                item => Date.now() - item.timestamp < 2 * 60 * 60 * 1000
            )
            logDebug(
                'UpstreamHealth',
                `Ping took ${Math.round(duration)}ms (Median: ${Math.round(
                    this.getMedianDuration() ?? 0
                )}ms)`,
                {
                    verbose: {
                        duration,
                        url,
                        status: response.status,
                        headers: headersToObject(response.headers),
                    },
                }
            )
        } catch (error) {
            // We don't care about errors here, we just want to measure the latency
        } finally {
            // Enqueue a new ping
            if (this.nextTimeoutId) {
                clearTimeout(this.nextTimeoutId)
            }
            this.nextTimeoutId = setTimeout(this.measure.bind(this), PING_INTERVAL)
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
