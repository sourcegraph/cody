import type { ExportResult } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { getVSCodeAPI } from '../../../webviews/utils/VSCodeApi'
const MAX_TRACE_RETAIN_MS = 60 * 1000 * 5 // 5 minutes

export class CodyTraceExporterWeb extends OTLPTraceExporter {
    private isTracingEnabled = false
    private queuedSpans: Map<string, { span: ReadableSpan; enqueuedAt: number }> = new Map()

    constructor({ isTracingEnabled }: { isTracingEnabled: boolean }) {
        super({
            httpAgentOptions: {
                rejectUnauthorized: false,
            },
            headers: {
                'Content-Type': 'application/json',
            },
        })
        this.isTracingEnabled = isTracingEnabled
    }

    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        if (!this.isTracingEnabled) {
            return
        }

        // Clean up expired spans
        const now = Date.now()
        for (const [spanId, { enqueuedAt }] of this.queuedSpans.entries()) {
            if (now - enqueuedAt > MAX_TRACE_RETAIN_MS) {
                this.queuedSpans.delete(spanId)
            }
        }

        // Build span hierarchy map
        const spanMap = new Map<string, ReadableSpan>()
        const spansByRoot = new Map<string, Set<ReadableSpan>>()

        // First, map all spans by their ID
        for (const span of [...spans, ...Array.from(this.queuedSpans.values()).map(q => q.span)]) {
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
            if (!rootSpan || !isRootSampled(rootSpan)) {
                continue
            }

            // Check if group has all required spans
            const hasRenderSpan = Array.from(spanGroup).some(
                span => span.name === 'assistant-message-render'
            )
            const hasCompletedRender = Array.from(spanGroup).some(
                span =>
                    span.name === 'assistant-message-render' &&
                    span.attributes['render.state'] === 'completed'
            )

            if (hasRenderSpan && hasCompletedRender) {
                // Add all spans from complete groups
                spansToExport.push(...spanGroup)

                // Remove these spans from queued spans if present
                for (const span of spanGroup) {
                    this.queuedSpans.delete(span.spanContext().spanId)
                }
            } else if (hasRenderSpan) {
                // Queue incomplete groups
                for (const span of spanGroup) {
                    const spanId = span.spanContext().spanId
                    if (!this.queuedSpans.has(spanId)) {
                        this.queuedSpans.set(spanId, { span, enqueuedAt: now })
                    }
                }
            }
        }

        if (spansToExport.length > 0) {
            this.send(spansToExport)
            super.export(spansToExport, resultCallback)
        }
    }

    send(spans: ReadableSpan[]): void {
        try {
            const exportData = this.convert(spans)
            const safeData = JSON.stringify(exportData, getCircularReplacer())

            console.log('[CodyTraceExporterWeb] Exporting spans:', {
                count: spans.length,
                rootSpans: spans.filter(s => !s.parentSpanId).length,
                renderSpans: spans.filter(s => s.name === 'assistant-message-render').length,
            })

            saveToLocalStorage(safeData)
            getVSCodeAPI().postMessage({
                command: 'trace-export',
                traceSpan: safeData,
            })
        } catch (error) {
            console.error('[CodyTraceExporterWeb] Error exporting spans:', error)
        }
    }
}

function getRootSpan(spanMap: Map<string, ReadableSpan>, span: ReadableSpan): ReadableSpan | null {
    if (!span.parentSpanId) {
        return span
    }
    const parentSpan = spanMap.get(span.parentSpanId)
    if (!parentSpan) {
        return null
    }
    return getRootSpan(spanMap, parentSpan)
}

function isRootSampled(rootSpan: ReadableSpan): boolean {
    return rootSpan.attributes.sampled === true
}

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

function saveToLocalStorage(data: string, key = 'myData') {
    localStorage.setItem(key, data)
    console.log(`[CodyTraceExporterWeb] Data has been saved to localStorage with key: ${key}`)
}
