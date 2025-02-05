import type { ExportResult } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { OpenTelemetryServiceConfig } from './OpenTelemetryService.node'

const MAX_TRACE_RETAIN_MS = 60 * 1000

export class CodyTraceExporter extends OTLPTraceExporter {
    private queuedSpans: Map<string, { span: ReadableSpan; enqueuedAt: number }> = new Map()

    constructor(private configAccessor: () => OpenTelemetryServiceConfig | null) {
        super({
            url: configAccessor()?.traceUrl,
            headers: {
                ...(configAccessor()?.accessToken
                    ? { Authorization: `token ${configAccessor()?.accessToken}` }
                    : {}),
            },
            httpAgentOptions: { rejectUnauthorized: false },
        })
    }

    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        const config = this.configAccessor()
        if (!config?.isTracingEnabled) {
            this.queuedSpans.clear()
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
                // The child of the root is sampled but root is not and the span is continued
                // This for the cases where the root span is actually present in the webview
                // but not in the extension host.
                const effectiveRootSpan = getEffectiveRootSpan(spanMap, span)
                if (
                    effectiveRootSpan &&
                    isSampled(effectiveRootSpan) &&
                    isContinued(effectiveRootSpan)
                ) {
                    spansToExport.push(span)
                    // Since we pushed the spans, we don't need to queue them
                    continue
                }

                const spanId = span.spanContext().spanId
                if (!this.queuedSpans.has(spanId)) {
                    // No root span was found yet, so let's queue this span for a
                    // later export. This happens when part of the span flushes
                    // before the parent finishes
                    this.queuedSpans.set(spanId, { span, enqueuedAt: now })
                }
            } else {
                if (isSampled(rootSpan)) {
                    spansToExport.push(span)
                }
                // else: The span is dropped
            }
        }

        super.export(spansToExport, resultCallback)
    }
}

// This function checks if a span is continued in the extension host where the parent span is present
// in the webview.
function isContinued(span: ReadableSpan): boolean {
    return span.attributes.continued === true
}

// This function attempts to find the "effective root span" for a given span.
// The effective root span is defined as the first ancestor span that is not found in the span map.
// If a parent span is not found, it assumes the current span is the effective root.
function getEffectiveRootSpan(
    spanMap: Map<string, ReadableSpan>,
    span: ReadableSpan
): ReadableSpan | null {
    let currentSpan = span

    while (currentSpan.parentSpanId) {
        const parentSpan = spanMap.get(currentSpan.parentSpanId)
        if (!parentSpan) {
            // If the parent span is not found in the map, the current span is considered the effective root.
            return currentSpan
        }
        currentSpan = parentSpan
    }

    // If there is no parent span ID, the span is considered a root span.
    return null
}

function isSampled(span: ReadableSpan): boolean {
    return span.attributes.sampled === true
}

// This function finds the root span of a given span so that we can check eventually check if it is sampled.
// This is useful to put all the spans that are part of the same trace together.
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
