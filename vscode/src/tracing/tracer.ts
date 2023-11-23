import opentelemetry, { SpanStatusCode } from '@opentelemetry/api'

export const tracer = opentelemetry.trace.getTracer('cody', '0.1')

export function startAsyncSpan<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        void tracer.startActiveSpan(name, async span => {
            console.log({ id: span.spanContext().traceId })
            try {
                const result = await fn()
                resolve(result)
            } catch (error: any) {
                span.recordException(error)
                span.setStatus({ code: SpanStatusCode.ERROR })
                reject(error)
            } finally {
                span.end()
            }
        })
    })
}
