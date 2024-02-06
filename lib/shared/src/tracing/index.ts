import opentelemetry, {
    SpanStatusCode,
    context,
    propagation,
    type Exception,
    Span,
} from '@opentelemetry/api'

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

export function wrapInActiveSpan<R>(name: string, fn: (span: Span) => R): R {
    let isSync = true
    return tracer.startActiveSpan(name, (span): R => {
        const start = performance.now()
        const handleSuccess = (response: R): R => {
            console.log('SUCCESS', name, performance.now() - start)
            span.setStatus({ code: SpanStatusCode.OK })
            span.end()
            return response
        }

        const catchError = (error: unknown): never => {
            console.log('ERROR', name, performance.now() - start)
            span.recordException(error as Exception)
            span.setStatus({ code: SpanStatusCode.ERROR })
            span.end()
            throw error
        }

        try {
            const response = fn(span)

            if (typeof response === 'object' && response !== null && 'then' in response) {
                isSync = false
                // @ts-ignore Thenable, duh!
                return response.then(handleSuccess, catchError) as R
            }

            return handleSuccess(response)
        } catch (error) {
            return catchError(error)
        } finally {
            if (isSync) {
                span.end()
            }
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
