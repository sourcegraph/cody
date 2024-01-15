import * as anthropic from '@anthropic-ai/sdk'

import { type Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

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
