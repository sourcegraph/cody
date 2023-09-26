import * as anthropic from '@anthropic-ai/sdk'
import * as uuid from 'uuid'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { Completion } from './types'

export function messagesToText(messages: Message[]): string {
    return messages
        .map(
            message =>
                `${message.speaker === 'human' ? anthropic.HUMAN_PROMPT : anthropic.AI_PROMPT}${
                    message.text === undefined ? '' : ' ' + message.text
                }`
        )
        .join('')
}

/**
 * The size of the Jaccard distance match window in number of lines. It determines how many
 * lines of the 'matchText' are considered at once when searching for a segment
 * that is most similar to the 'targetText'. In essence, it sets the maximum number
 * of lines that the best match can be. A larger 'windowSize' means larger potential matches
 */
export const SNIPPET_WINDOW_SIZE = 50

export function lastNLines(text: string, n: number): string {
    const lines = text.split('\n')
    return lines.slice(Math.max(0, lines.length - n)).join('\n')
}

/**
 * Creates a new signal that forks a parent signal. When the parent signal is aborted, the forked
 * signal will be aborted as well. This allows propagating abort signals across asynchronous
 * operations.
 *
 * Aborting the forked controller however does not affect the parent.
 */
export function forkSignal(signal: AbortSignal): AbortController {
    const controller = new AbortController()
    if (signal.aborted) {
        controller.abort()
    }
    signal.addEventListener('abort', () => controller.abort())
    return controller
}

/**
 * Creates a simple subscriber that can be used to register callbacks
 */
type Listener<T> = (value: T) => void
interface Subscriber<T> {
    subscribe(listener: Listener<T>): () => void
    notify(value: T): void
}
export function createSubscriber<T>(): Subscriber<T> {
    const listeners: Set<Listener<T>> = new Set()
    function subscribe(listener: Listener<T>): () => void {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }

    function notify(value: T): void {
        for (const listener of listeners) {
            listener(value)
        }
    }

    return {
        subscribe,
        notify,
    }
}

export function createCompletion(insertText: string, stopReason?: string): Completion {
    return {
        id: uuid.v4(),
        insertText,
        stopReason,
    }
}
