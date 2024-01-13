import opentelemetry, { context, propagation, SpanStatusCode, type Exception } from '@opentelemetry/api'

const INSTRUMENTATION_SCOPE_NAME = 'cody'
const INSTRUMENTATION_SCOPE_VERSION = '0.1'

const tracer = opentelemetry.trace.getTracer(INSTRUMENTATION_SCOPE_NAME, INSTRUMENTATION_SCOPE_VERSION)

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

export function wrapInActiveSpan<R>(name: string, fn: () => R): R {
    return tracer.startActiveSpan(name, (span): R => {
        const handleSuccess = (response: R): R => {
            span.setStatus({ code: SpanStatusCode.OK })
            return response
        }

        const catchError = (error: unknown): never => {
            span.recordException(error as Exception)
            span.setStatus({ code: SpanStatusCode.ERROR })
            throw error
        }

        try {
            const response = fn()

            if (response instanceof Promise) {
                return response.then(handleSuccess, catchError) as R
            }

            return handleSuccess(response)
        } catch (error) {
            return catchError(error)
        } finally {
            span.end()
        }
    })
}

/**
 * Create a Trace Context compliant traceparent header value.
 * c.f. https://www.w3.org/TR/trace-context/#examples-of-http-traceparent-headers
 */
export function addTraceparent(headers: Headers): void {
    propagation.inject(context.active(), headers, {
        set(carrier, key, value) {
            carrier.set(key, value)
        },
    })
}
