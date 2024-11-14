import { currentResolvedConfig } from '@sourcegraph/cody-shared'
import fetch from 'node-fetch'
import { logDebug, logError } from '../../output-channel-logger'

/**
 * Sends trace data to the server without blocking
 */
export function send(spanData: any): void {
    // Don't await - let it run in background, but do handle errors
    void doSendTraceData(spanData).catch(error => {
        logError('TraceSender', `Error sending trace data: ${error}`)
    })
}

async function doSendTraceData(spanData: any): Promise<void> {
    const { auth } = await currentResolvedConfig()
    if (!auth.accessToken) {
        // Log and rethrow to be handled by the error collector
        logError('TraceSender', 'Cannot send trace data: not authenticated')
        throw new Error('Not authenticated')
    }

    const traceUrl = new URL('/-/debug/otlp/v1/traces', auth.serverEndpoint).toString()
    const response = await fetch(traceUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(auth.accessToken ? { Authorization: `token ${auth.accessToken}` } : {}),
        },
        body: spanData,
    })

    if (!response.ok) {
        throw new Error(`Failed to send trace data: ${response.statusText}`)
    }

    logDebug('TraceSender', 'Trace data sent successfully')
}
