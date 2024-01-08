import { Attributes, Span, trace } from '@opentelemetry/api'

/**
 * Adds OpenTelemetry event to the current active span in the development environment.
 * Does nothing in production environments.
 *
 * If `currentLinePrefix` and `text` attributes are present,
 * merges them into one formatted attrbiute (useful for autcomplete events logging).
 */
export const addAutocompleteDebugEvent = (name: string, attributes: Record<string, unknown> = {}): Span | void => {
    if (process.env.NODE_ENV === 'development') {
        const activeSpan = trace.getActiveSpan()

        const { currentLinePrefix, text, ...rest } = attributes
        if (typeof currentLinePrefix === 'string' && typeof text === 'string') {
            const formattedText = `${currentLinePrefix}█${text.trimStart()}`
            return activeSpan?.addEvent(name, { text: formattedText, ...rest })
        }

        return activeSpan?.addEvent(name, attributes as Attributes)
    }
}
