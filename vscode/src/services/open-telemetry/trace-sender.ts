import { logDebug, logError } from '../../output-channel-logger'
import { currentResolvedConfig } from '@sourcegraph/cody-shared'
import fetch from 'node-fetch'

export class TraceSender {
    /**
     * Sends trace data to the server without blocking
     */
    public static async send(spanData: any): Promise<void> {
        // Fire and forget the trace data send don't wait or block
        await this.doSendTraceData(spanData)
    }

    private static async doSendTraceData(spanData: any): Promise<void> {
        try {
            const { auth } = await currentResolvedConfig()
            if (!auth.accessToken) {
                logError('TraceSender', 'Cannot send trace data: not authenticated')
                return
            }

            const traceUrl = new URL('/-/debug/otlp/v1/traces', auth.serverEndpoint).toString()
            const response = await fetch(traceUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(auth.accessToken ? { 'Authorization': `token ${auth.accessToken}` } : {})
                },
                body: spanData
            })

            if (!response.ok) {
                throw new Error(`Failed to send trace data: ${response.statusText}`)
            }

            logDebug('TraceSender', 'Trace data sent successfully')
        } catch (error) {
            logError('TraceSender', `Error sending trace data: ${error}`)
        }
    }
}