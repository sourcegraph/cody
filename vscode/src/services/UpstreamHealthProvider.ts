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
const PING_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

/**
 * A provider that regularly pings the connected Sourcegraph instance to
 * understand the latencies between the client and the instance.
 *
 * You can query it to get aggregates of the most recent pings.
 */
export class UpstreamHealthProvider implements vscode.Disposable {
    // Array sorted by duration for easy median calculation
    private recentDurationsSorted: { timestamp: number; duration: number }[] = []

    private config: Pick<
        ConfigurationWithAccessToken,
        'serverEndpoint' | 'customHeaders' | 'accessToken'
    > | null = null
    private nextTimeoutId: NodeJS.Timeout | null = null

    public getMedianDuration(): number | undefined {
        if (!this.config) {
            return undefined
        }
        if (this.recentDurationsSorted.length === 0) {
            return undefined
        }
        return this.recentDurationsSorted[Math.floor(this.recentDurationsSorted.length / 2)].duration
    }

    public onConfigurationChange(
        newConfig: Pick<ConfigurationWithAccessToken, 'serverEndpoint' | 'customHeaders' | 'accessToken'>
    ): this {
        this.config = newConfig
        this.recentDurationsSorted = []
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

            // We use a GET request even though we do not want to consume the
            // body to avoid internal networks interfering with the request.
            //
            // To make sure the content is garbage collected, we'll ensure that
            // the body is consumed. We don't use undici yet but that might
            // change in the future:
            //
            // https://undici.nodejs.org/#/?id=garbage-collection
            const response = await fetch(url.toString(), { method: 'GET', headers })
            void response.arrayBuffer() // consume the body

            const duration = Date.now() - start
            this.pushDuration(duration)

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
            this.nextTimeoutId = setTimeout(this.measure.bind(this), PING_INTERVAL_MS)
        }
    }

    public dispose(): void {
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }
    }

    private pushDuration(duration: number): void {
        const entry = { timestamp: Date.now(), duration }

        // Delete items that are older than 2 hours
        this.recentDurationsSorted = this.recentDurationsSorted.filter(
            item => Date.now() - item.timestamp < TWO_HOURS_MS
        )

        const position = this.recentDurationsSorted.findIndex(item => item.duration > duration)
        if (position === -1) {
            this.recentDurationsSorted.push(entry)
        } else {
            this.recentDurationsSorted.splice(position, 0, entry)
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
