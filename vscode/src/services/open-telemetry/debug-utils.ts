import { Attributes, Span, trace } from '@opentelemetry/api'

export const addDebugEventToActiveSpan = (name: string, attributes: Record<string, unknown> = {}): Span | void => {
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
