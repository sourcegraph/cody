import opentelemetry, { SpanStatusCode, context, propagation, type Span } from '@opentelemetry/api'

const INSTRUMENTATION_SCOPE_NAME = 'cody'
const INSTRUMENTATION_SCOPE_VERSION = '0.1'

export const tracer = opentelemetry.trace.getTracer(
    INSTRUMENTATION_SCOPE_NAME,
    INSTRUMENTATION_SCOPE_VERSION
)

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

export function wrapInActiveSpan<R>(name: string, fn: (span: Span) => R): R {
    return tracer.startActiveSpan(name, (span): R => {
        const handleSuccess = (response: R): R => {
            span.setStatus({ code: SpanStatusCode.OK })
            span.end()
            return response
        }

        const handleError = (error: unknown): never => {
            recordErrorToSpan(span, error as Error)
            throw error
        }

        try {
            const response = fn(span)

            if (typeof response === 'object' && response !== null && 'then' in response) {
                // @ts-ignore Response seems to be a Thenable
                return response.then(handleSuccess, handleError) as R
            }

            return handleSuccess(response)
        } catch (error) {
            return handleError(error)
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

export function getTraceparentHeaders(): { [key: string]: string } {
    const headers: { [key: string]: string } = {}
    propagation.inject(context.active(), headers, {
        set(carrier, key, value) {
            carrier[key] = value
        },
    })
    return headers
}

export function recordErrorToSpan(span: Span, error: Error): Error {
    span.recordException(error)
    span.setStatus({ code: SpanStatusCode.ERROR })
    span.end()
    return error
}
