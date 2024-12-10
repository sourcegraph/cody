import type { ExportResult } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { CodyIDE } from '@sourcegraph/cody-shared/src/configuration'
import { getVSCodeAPI } from '../../../webviews/utils/VSCodeApi'
import { logDebug } from '../../../webviews/utils/logger'

const MAX_TRACE_RETAIN_MS = 60 * 1000 * 5 // 5 minutes

// Exports spans as JSON to the extension host so that it can be sent to the OTel collector on the SG instance
export class CodyTraceExporterWeb extends OTLPTraceExporter {
    private isTracingEnabled: boolean
    private queuedSpans: Map<string, { span: ReadableSpan; enqueuedAt: number }> = new Map()
    private clientPlatform: CodyIDE
    private agentVersion?: string
    private lastExpiryCheck = 0

    constructor({
        isTracingEnabled,
        clientPlatform,
        agentVersion,
    }: { isTracingEnabled: boolean; clientPlatform: CodyIDE; agentVersion?: string }) {
        super({
            httpAgentOptions: {
                rejectUnauthorized: false,
            },
            headers: {
                'Content-Type': 'application/json',
            },
        })
        this.isTracingEnabled = isTracingEnabled
        this.clientPlatform = clientPlatform
        this.agentVersion = agentVersion
    }

    private removeExpiredSpans(now: number): void {
        for (const [spanId, { enqueuedAt }] of this.queuedSpans.entries()) {
            if (now - enqueuedAt > MAX_TRACE_RETAIN_MS) {
                this.queuedSpans.delete(spanId)
                logDebug('[CodyTraceExporterWeb] Removed expired span from queue:', spanId)
            }
        }
    }

    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        if (!this.isTracingEnabled) {
            return
        }

        const now = performance.now()
        if (now - this.lastExpiryCheck > MAX_TRACE_RETAIN_MS) {
            this.removeExpiredSpans(now)
            this.lastExpiryCheck = now
        }

        // Include queued spans for re-evaluation
        const allSpans = [...spans, ...Array.from(this.queuedSpans.values()).map(q => q.span)]
        for (const span of allSpans) {
            span.attributes.clientPlatform = this.clientPlatform
            span.attributes.agentVersion = this.agentVersion
        }

        // Build span hierarchy map
        const spanMap = new Map<string, ReadableSpan>()
        const spansByRoot = new Map<string, Set<ReadableSpan>>()

        // First, map all spans by their ID
        for (const span of allSpans) {
            spanMap.set(span.spanContext().spanId, span)
        }

        // Group spans by their root span
        for (const span of spanMap.values()) {
            const rootSpan = getRootSpan(spanMap, span)
            if (rootSpan) {
                const rootId = rootSpan.spanContext().spanId
                if (!spansByRoot.has(rootId)) {
                    spansByRoot.set(rootId, new Set())
                }
                spansByRoot.get(rootId)?.add(span)
            } else {
                // Queue spans without a root for later
                const spanId = span.spanContext().spanId
                if (!this.queuedSpans.has(spanId)) {
                    this.queuedSpans.set(spanId, { span, enqueuedAt: now })
                }
            }
        }

        const spansToExport: ReadableSpan[] = []

        // Process each group of spans
        for (const [rootId, spanGroup] of spansByRoot.entries()) {
            const rootSpan = spanMap.get(rootId)
            if (!rootSpan || !isSampled(rootSpan)) {
                continue
            }

            // Add all spans from complete groups
            spansToExport.push(...spanGroup)

            // Remove these spans from queued spans if present
            for (const span of spanGroup) {
                this.queuedSpans.delete(span.spanContext().spanId)
                logDebug('[CodyTraceExporterWeb] Removed span from queue:', span.spanContext().spanId)
            }
        }
        if (spansToExport.length > 0) {
            super.export(spansToExport, resultCallback)
        }
    }

    send(spans: ReadableSpan[]): void {
        try {
            const exportData = this.convert(spans)

            logDebug(
                '[CodyTraceExporterWeb] Exporting spans',
                JSON.stringify({
                    count: spans.length,
                    rootSpans: spans.filter(s => !s.parentSpanId).length,
                    renderSpans: spans.filter(s => s.name === 'assistant-message-render').length,
                })
            )

            // Validate and clean the export data before sending
            const messageData = {
                resourceSpans: (exportData.resourceSpans ?? []).map(span => ({
                    ...span,
                    resource: {
                        ...span?.resource,
                        attributes:
                            span?.resource?.attributes?.map(attr => ({
                                key: attr.key,
                                value: attr.value,
                            })) ?? [],
                    },
                })),
                timestamp: performance.now(),
            }

            // Send the validated and cleaned data
            getVSCodeAPI().postMessage({
                command: 'trace-export',
                traceSpanEncodedJson: JSON.stringify(messageData, getCircularReplacer()),
            })
        } catch (error) {
            console.error('[CodyTraceExporterWeb] Error exporting spans:', error)
        }
    }
}

function getRootSpan(spanMap: Map<string, ReadableSpan>, span: ReadableSpan): ReadableSpan | null {
    // Start with the input span
    let currentSpan = span

    while (true) {
        // If we find a span without a parent, it's the root
        if (!currentSpan.parentSpanId) {
            return currentSpan
        }

        const parentSpan = spanMap.get(currentSpan.parentSpanId)

        // Return null if parent ID exists but parent span not found.
        // These spans are expected to be completed later.
        if (!parentSpan) {
            return null
        }

        currentSpan = parentSpan
    }
}

function isSampled(rootSpan: ReadableSpan): boolean {
    return rootSpan.attributes.sampled === true
}

// Helper function to handle circular references in JSON serialization
function getCircularReplacer() {
    const seen = new WeakSet()
    return (key: string, value: any) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return
            }
            seen.add(value)
        }
        return value
    }
}
