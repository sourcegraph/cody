import {
    type BrowserOrNodeResponse,
    addCodyClientIdentificationHeaders,
    addTraceparent,
    currentResolvedConfig,
    distinctUntilChanged,
    isDotCom,
    logDebug,
    resolvedConfig,
    subscriptionDisposable,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { fetch } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

// We choose an interval that gives us a reasonable aggregate without causing
// too many requests
const PING_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const INITIAL_PING_DELAY_MS = 10 * 1000 // 10 seconds

/**
 * A provider that regularly pings the connected Sourcegraph instance to
 * understand the latencies between the client and the instance.
 *
 * You can query it to get aggregates of the most recent pings.
 */
class UpstreamHealthProvider implements vscode.Disposable {
    private lastUpstreamLatency?: number
    private lastGatewayLatency?: number

    private disposables: vscode.Disposable[] = []

    private nextTimeoutId: NodeJS.Timeout | null = null

    constructor() {
        // Refresh when auth (endpoint or token) changes.
        this.disposables.push(
            subscriptionDisposable(
                resolvedConfig.pipe(distinctUntilChanged()).subscribe(() => {
                    this.lastUpstreamLatency = undefined
                    this.lastGatewayLatency = undefined

                    this.enqueue(INITIAL_PING_DELAY_MS)
                })
            ),
            vscode.window.onDidChangeWindowState(state => {
                if (state.focused && this.lastMeasurementSkippedBecauseNotFocused) {
                    this.lastMeasurementSkippedBecauseNotFocused = false
                    this.enqueue(INITIAL_PING_DELAY_MS)
                }
            })
        )
    }

    public getUpstreamLatency(): number | undefined {
        return this.lastUpstreamLatency
    }

    public getGatewayLatency(): number | undefined {
        return this.lastGatewayLatency
    }

    private enqueue(delay: number): void {
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }
        this.nextTimeoutId = setTimeout(this.measure.bind(this), delay)
    }

    private lastMeasurementSkippedBecauseNotFocused = false

    private async measure() {
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }

        if (!vscode.window.state.focused) {
            // Skip if the window is not focused, and try again when the window becomes focused
            // again. Some users have OS firewalls that make periodic background network access
            // annoying for users, and this eliminates that annoyance. See
            // https://linear.app/sourcegraph/issue/CODY-3745/codys-background-periodic-network-access-causes-2fa.
            this.lastMeasurementSkippedBecauseNotFocused = true
            return
        }

        try {
            if (process.env.DISABLE_UPSTREAM_HEALTH_PINGS === 'true') {
                return
            }

            const { auth, configuration } = await currentResolvedConfig()
            const sharedHeaders = new Headers(configuration.customHeaders as HeadersInit | undefined)
            sharedHeaders.set('Content-Type', 'application/json; charset=utf-8')
            addTraceparent(sharedHeaders)
            addCodyClientIdentificationHeaders(sharedHeaders)

            const upstreamHeaders = new Headers(sharedHeaders)
            if (auth.accessToken) {
                upstreamHeaders.set('Authorization', `token ${auth.accessToken}`)
            }
            const url = new URL('/healthz', auth.serverEndpoint)
            const upstreamResult = await wrapInActiveSpan('upstream-latency.upstream', span => {
                span.setAttribute('sampled', true)
                return measureLatencyToUri(upstreamHeaders, url.toString())
            })

            // We don't want to congest the network so we run the test serially
            if (isDotCom(auth.serverEndpoint)) {
                const gatewayHeaders = new Headers(sharedHeaders)
                const uri = 'https://cody-gateway.sourcegraph.com/-/__version'
                const gatewayResult = await wrapInActiveSpan('upstream-latency.gateway', span => {
                    span.setAttribute('sampled', true)
                    return measureLatencyToUri(gatewayHeaders, uri)
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
                        verbose: `url=${url} status=${
                            upstreamResult.response.status
                        } cf-ray=${upstreamResult.response.headers.get('cf-ray')}`,
                    }
                )
            }
        } catch (error) {
            // We don't care about errors here, we just want to measure the latency
        } finally {
            // Enqueue a new ping
            this.enqueue(PING_INTERVAL_MS)
        }
    }

    public dispose(): void {
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}

export const upstreamHealthProvider = new UpstreamHealthProvider()

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
