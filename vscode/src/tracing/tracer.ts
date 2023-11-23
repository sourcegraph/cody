import opentelemetry, { SpanStatusCode } from '@opentelemetry/api'

export const tracer = opentelemetry.trace.getTracer('cody', '0.1')

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
