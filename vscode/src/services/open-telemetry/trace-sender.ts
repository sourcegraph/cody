import { addAuthHeaders, currentResolvedConfig, fetch } from '@sourcegraph/cody-shared'
import { logDebug, logError } from '../../output-channel-logger'

/**
 * Sends trace data to the server without blocking
 */
export const TraceSender = {
    send(spanData: any): void {
        // Don't await - let it run in background, but do handle errors
        void doSendTraceData(spanData).catch(error => {
            logError('TraceSender', `Error sending trace data: ${error}`)
        })
    },
}

/**
 * Sends trace data to the server using the provided span data as a json string
 * that comes from the webview. It retrieves the current resolved configuration to obtain
 * authentication details and constructs the trace URL. It sends a POST
 * request with the span data as the body.
 */
async function doSendTraceData(spanData: any): Promise<void> {
    const { auth } = await currentResolvedConfig()
    if (!auth.credentials) {
        logError('TraceSender', 'Cannot send trace data: not authenticated')
        throw new Error('Not authenticated')
    }

    const traceUrl = new URL('/-/debug/otlp/v1/traces', auth.serverEndpoint)

    const headers = new Headers({ 'Content-Type': 'application/json' })
    await addAuthHeaders(auth, headers, traceUrl)

    const response = await fetch(traceUrl, {
        method: 'POST',
        headers: headers,
        body: spanData,
    })

    if (!response.ok) {
        logError('TraceSender', `Failed to send trace data: ${response.statusText}`)
        throw new Error(`Failed to send trace data: ${response.statusText}`)
    }

    logDebug('TraceSender', 'Trace data sent successfully')
}
