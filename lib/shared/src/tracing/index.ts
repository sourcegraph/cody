import opentelemetry, { SpanStatusCode } from '@opentelemetry/api'

const INSTRUMENTATION_SCOPE_NAME = 'cody'
const INSTRUMENTATION_SCOPE_VERSION = '0.1'

export const tracer = opentelemetry.trace.getTracer(INSTRUMENTATION_SCOPE_NAME, INSTRUMENTATION_SCOPE_VERSION)

export function getActiveTraceAndSpanId(): { traceId: string; spanId: string } | undefined {
    const activeSpan = opentelemetry.trace.getActiveSpan()
    if (activeSpan) {
        const context = activeSpan.spanContext()
        return {
            traceId: context.traceId,
            spanId: context.spanId,
        }
    }
    return undefined
}

export function startAsyncSpan<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    return tracer.startActiveSpan(name, span =>
        Promise.resolve(fn())
            .catch(error => {
                span.recordException(error)
                span.setStatus({ code: SpanStatusCode.ERROR })
                throw error
            })
            .finally(() => {
                span.end()
            })
    )
}

/**
 * Create a Trace Context compliant traceparent header value.
 * c.f. https://www.w3.org/TR/trace-context/#examples-of-http-traceparent-headers
 */
export function getTraceparent(): string | null {
    const activeIds = getActiveTraceAndSpanId()
    if (activeIds) {
        return `00-${activeIds.traceId}-${activeIds.spanId}-01`
    }
    return null
}
