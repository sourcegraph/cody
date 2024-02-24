import { type ExportResult, ExportResultCode, hrTimeToMilliseconds } from '@opentelemetry/core'
import { type ReadableSpan, Span, type SpanExporter } from '@opentelemetry/sdk-trace-base'

interface FormattedSpan extends ReadableSpan {
    children: FormattedSpan[]
}

/**
 * Nests spans using `parentSpanId` fields on a span batch and logs them into the console.
 * Used in the development environment for a faster feedback cycle and better span explorability
 */
export class ConsoleBatchSpanExporter implements SpanExporter {
    private formatDuration(span: ReadableSpan): string {
        return `${hrTimeToMilliseconds(span.duration).toString()}ms`
    }

    private nestSpans(spans: ReadableSpan[]): FormattedSpan[] {
        const rootSpans: FormattedSpan[] = []
        const formattedSpans: Record<string, FormattedSpan> = {}

        for (const span of spans) {
            const { parentSpanId } = span
            const { spanId } = span.spanContext()

            const formattedSpan: FormattedSpan = Object.assign(
                span,
                formattedSpans[spanId] ?? {
                    children: [],
                }
            )

            if (parentSpanId) {
                const parentSpan = formattedSpans[parentSpanId] ?? {
                    children: [],
                }
                parentSpan.children?.push(formattedSpan)
                formattedSpans[parentSpanId] = parentSpan
            } else {
                rootSpans.push(formattedSpan)
            }

            formattedSpans[spanId] = formattedSpan
        }

        return rootSpans
    }

    private logSpanTree(span: FormattedSpan, depth = 0): void {
        const { name, events, children, attributes } = span

        const hasAttributes = Object.entries(attributes).length > 0
        const hasEvents = events.length > 0
        const hasChildren = children.length > 0
        const hasContent = hasAttributes || hasEvents || hasChildren

        let title = `%c${name}%c - ${this.formatDuration(span)}`

        if (hasChildren) {
            title += `; ${children.length} ${children.length === 1 ? 'child' : 'children'}`
        }

        if (hasContent) {
            console.groupCollapsed(title, ...groupStyles)

            if (hasAttributes) {
                logAttrsGroup('attrs', attributes)
            }

            if (hasEvents || hasChildren) {
                const eventsWithStartTime = events.map(event =>
                    Object.assign(event, { startTime: event.time })
                )
                const eventsWithChildren = [...eventsWithStartTime, ...children]

                for (const eventOrSpan of sortByHrTime(eventsWithChildren)) {
                    if (isFormattedSpan(eventOrSpan)) {
                        this.logSpanTree(eventOrSpan, depth + 1)
                    } else {
                        const {
                            name,
                            attributes: { text, ...attributes } = {},
                        } = eventOrSpan

                        const attributesString =
                            Object.keys(attributes).length > 0 ? `: ${JSON.stringify(attributes)}` : ''
                        const textString = text ? `\n${text}` : ''

                        console.log(`%c${name}%c${attributesString}${textString}`, ...logStyles)
                    }
                }
            }

            console.groupEnd()
        } else {
            console.log(title, ...logStyles)
        }
    }

    public export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        const rootSpans = sortByHrTime(this.nestSpans(spans))

        for (const rootSpan of rootSpans) {
            this.logSpanTree(rootSpan)
        }

        resultCallback({ code: ExportResultCode.SUCCESS })
    }

    public shutdown(): Promise<void> {
        return Promise.resolve()
    }
}

const logStyles = ['color: green; font-weight:bold', 'color: black; font-weight: normal;']
const groupStyles = ['color: black; font-weight:bold', 'color: black; font-weight: normal;']

function isFormattedSpan(maybeSpan: unknown): maybeSpan is FormattedSpan {
    return maybeSpan instanceof Span && 'children' in maybeSpan
}

function sortByHrTime<T extends Pick<ReadableSpan, 'startTime'>>(spans: T[]): T[] {
    return spans.sort((spanA, spanB) => {
        const [secondsA, nanosecondsA] = spanA.startTime
        const [secondsB, nanosecondsB] = spanB.startTime

        if (secondsA !== secondsB) {
            return secondsA - secondsB
        }

        return nanosecondsA - nanosecondsB
    })
}

function logAttrsGroup(name: string, attrs: Record<string, unknown>): void {
    console.group(name)
    for (const [name, value] of Object.entries(attrs)) {
        console.log(`${name}: ${value}`)
    }
    console.groupEnd()
}
