import {
    type Attributes,
    type Context,
    type Span,
    type SpanOptions,
    SpanStatusCode,
    type Tracer,
    context,
    trace,
} from '@opentelemetry/api'

// Extend SpanOptions to optionally include context
type SpanManagerOptions = SpanOptions & {
    context?: Context
}

/**
 * SpanManager is responsible for managing the lifecycle of spans used in tracing.
 * It provides methods to start, end, and manage spans, as well as to handle context propagation.
 *
 * Features:
 * - Start and manage active spans with context propagation.
 * - End spans and record exceptions.
 * - Set attributes on spans.
 * - Clear all spans and reset the active context.
 */
export class SpanManager {
    private spans = new Map<string, Span>()
    private endedSpans = new Set<string>()
    private tracer: Tracer
    private activeContext?: Context

    constructor(tracerName = 'cody-webview') {
        this.tracer = trace.getTracer(tracerName)
    }

    startActiveSpan<T>(
        name: string,
        optionsOrFn: SpanManagerOptions | ((span: Span) => Promise<T> | T),
        fnOrUndefined?: (span: Span) => Promise<T> | T
    ): Promise<T> {
        const options = typeof optionsOrFn === 'function' ? {} : optionsOrFn
        const fn = typeof optionsOrFn === 'function' ? optionsOrFn : fnOrUndefined

        if (!fn) {
            throw new Error('No callback function provided to startActiveSpan')
        }

        // Context is optional - if not provided, use active context
        const parentContext = options.context || this.activeContext || context.active()

        // Extract standard SpanOptions from SpanManagerOptions
        const spanOptions: SpanOptions = {
            attributes: options.attributes,
            kind: options.kind,
            links: options.links,
            startTime: options.startTime,
        }

        return this.tracer.startActiveSpan(name, spanOptions, async span => {
            this.spans.set(name, span)

            // Create new context with this span
            const spanContext = trace.setSpan(parentContext, span)
            this.activeContext = spanContext

            try {
                return await context.with(spanContext, () => fn(span))
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : 'Unknown error',
                })
                span.recordException(error as Error)
                throw error
            } finally {
                this.endSpan(name)
            }
        })
    }

    startSpan(name: string, options?: SpanManagerOptions): Span | undefined {
        if (this.spans.has(name)) {
            return this.spans.get(name)
        }

        // Use provided context or fall back to active context
        const parentContext = options?.context || this.activeContext || context.active()

        // Extract standard SpanOptions from SpanManagerOptions
        const spanOptions: SpanOptions = {
            attributes: options?.attributes,
            kind: options?.kind,
            links: options?.links,
            startTime: options?.startTime,
        }

        const span = this.tracer.startSpan(name, spanOptions, parentContext)
        this.spans.set(name, span)
        return span
    }

    getActiveContext(): Context | undefined {
        return this.activeContext
    }

    setActiveContext(ctx: Context): void {
        this.activeContext = ctx
    }

    endSpan(name: string): void {
        const span = this.spans.get(name)
        if (span && !this.endedSpans.has(name)) {
            span.end()
            this.endedSpans.add(name)
            this.spans.delete(name)
        }
    }

    setSpanAttributes(name: string, attributes: Record<string, unknown>): void {
        const span = this.spans.get(name)
        if (span && !this.endedSpans.has(name)) {
            span.setAttributes(attributes as Attributes)
        }
    }

    endAllSpans(): void {
        this.spans.forEach((_, name) => this.endSpan(name))
    }

    clear(): void {
        this.endAllSpans()
        this.spans.clear()
        this.endedSpans.clear()
        this.activeContext = undefined
    }
}
