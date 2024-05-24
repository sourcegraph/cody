import type { ExportResult } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'

const MAX_TRACE_RETAIN_MS = 60 * 1000

export class CodyTraceExporter extends OTLPTraceExporter {
    private isTracingEnabled = false
    private queuedSpans: Map<string, { span: ReadableSpan; enqueuedAt: number }> = new Map()

    constructor({
        traceUrl,
        accessToken,
        isTracingEnabled,
    }: { traceUrl: string; accessToken: string | null; isTracingEnabled: boolean }) {
        super({
            url: traceUrl,
            httpAgentOptions: { rejectUnauthorized: false },
            headers: {
                ...(accessToken ? { Authorization: `token ${accessToken}` } : {}),
            },
        })
        this.isTracingEnabled = isTracingEnabled
    }

    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        if (!this.isTracingEnabled) {
            return
        }

        const now = Date.now()

        // Remove any spans that have been queued for too long
        for (const { span, enqueuedAt } of this.queuedSpans.values()) {
            if (now - enqueuedAt > MAX_TRACE_RETAIN_MS) {
                this.queuedSpans.delete(span.spanContext().spanId)
            }
        }

        for (const { span } of this.queuedSpans.values()) {
            spans.push(span)
        }

        const spanMap = new Map<string, ReadableSpan>()
        for (const span of spans) {
            spanMap.set(span.spanContext().spanId, span)
        }

        const spansToExport: ReadableSpan[] = []
        for (const span of spans) {
            const rootSpan = getRootSpan(spanMap, span)
            if (rootSpan === null) {
                const spanId = span.spanContext().spanId
                if (!this.queuedSpans.has(spanId)) {
                    // No root span was found yet, so let's queue this span for a
                    // later export. This happens when part of the span flushes
                    // before the parent finishes
                    this.queuedSpans.set(spanId, { span, enqueuedAt: now })
                }
            } else {
                if (isRootSampled(rootSpan)) {
                    spansToExport.push(span)
                }
                // else: The span is dropped
            }
        }

        super.export(spansToExport, resultCallback)
    }
}

function getRootSpan(spanMap: Map<string, ReadableSpan>, span: ReadableSpan): ReadableSpan | null {
    if (span.parentSpanId) {
        const parentSpan = spanMap.get(span.parentSpanId)
        if (!parentSpan) {
            return null
        }
        return getRootSpan(spanMap, parentSpan)
    }
    return span
}

function isRootSampled(rootSpan: ReadableSpan): boolean {
    return rootSpan.attributes.sampled === true
}
