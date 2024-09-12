import { isError } from '../../utils'
import type { CompletionsResponseBuilder } from './CompletionsResponseBuilder'

import type { Event } from './types'

const EVENT_LINE_PREFIX = 'event: '
const DATA_LINE_PREFIX = 'data: '
const EVENTS_SEPARATOR = '\n\n'

function parseEventType(eventLine: string): Event['type'] | Error {
    if (!eventLine.startsWith(EVENT_LINE_PREFIX)) {
        return new Error(`cannot parse event type: ${eventLine}`)
    }
    const eventType = eventLine.slice(EVENT_LINE_PREFIX.length)
    switch (eventType) {
        case 'completion':
        case 'error':
        case 'done':
            return eventType
        default:
            return new Error(`unexpected event type: ${eventType}`)
    }
}

function parseJSON<T>(data: string): T | Error {
    try {
        return JSON.parse(data) as T
    } catch {
        return new Error(`invalid JSON: ${data}`)
    }
}

export interface CompletionData {
    completion?: string
    deltaText?: string
    stopReason?: string
}

export function parseCompletionJSON(jsonData: string): CompletionData | Error {
    return parseJSON<CompletionData>(jsonData)
}

function parseEventData(
    builder: CompletionsResponseBuilder,
    eventType: Event['type'],
    dataLine: string
): Event | Error {
    if (!dataLine.startsWith(DATA_LINE_PREFIX)) {
        return new Error(`cannot parse event data: ${dataLine}`)
    }

    const jsonData = dataLine.slice(DATA_LINE_PREFIX.length)
    switch (eventType) {
        case 'completion': {
            const data = parseCompletionJSON(jsonData)
            if (isError(data)) {
                return data
            }
            // Internally, don't handle delta text yet and there's limited value
            // in passing around deltas anyways so we concatenate them here.
            const completion = builder.nextCompletion(data.completion, data.deltaText)
            return {
                type: eventType,
                completion,
                stopReason: data.stopReason,
            }
        }
        case 'error': {
            const data = parseJSON<{ error: string }>(jsonData)
            if (isError(data)) {
                return data
            }
            if (typeof data.error === 'undefined') {
                return new Error('invalid error event')
            }
            return { type: eventType, error: data.error }
        }
        case 'done':
            return { type: eventType }
    }
}

function parseEvent(builder: CompletionsResponseBuilder, eventBuffer: string): Event | Error {
    const [eventLine, dataLine] = eventBuffer.split('\n')
    const eventType = parseEventType(eventLine)
    if (isError(eventType)) {
        return eventType
    }
    return parseEventData(builder, eventType, dataLine)
}

interface EventsParseResult {
    events: Event[]
    remainingBuffer: string
}

export function parseEvents(
    builder: CompletionsResponseBuilder,
    eventsBuffer: string
): EventsParseResult | Error {
    let eventStartIndex = 0
    let eventEndIndex = eventsBuffer.indexOf(EVENTS_SEPARATOR)

    const events: Event[] = []
    while (eventEndIndex >= 0) {
        const eventBuffer = eventsBuffer.slice(eventStartIndex, eventEndIndex)
        const event = parseEvent(builder, eventBuffer)
        if (isError(event)) {
            return event
        }
        events.push(event)

        eventStartIndex = eventEndIndex + EVENTS_SEPARATOR.length
        eventEndIndex = eventsBuffer.indexOf(EVENTS_SEPARATOR, eventStartIndex)
    }

    return { events, remainingBuffer: eventsBuffer.slice(eventStartIndex) }
}
