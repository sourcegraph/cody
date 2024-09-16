import * as anthropic from '@anthropic-ai/sdk'

import { type Message, TimeoutError } from '@sourcegraph/cody-shared'

export function messagesToText(messages: Message[]): string {
    return messages
        .map(
            message =>
                `${message.speaker === 'human' ? anthropic.HUMAN_PROMPT : anthropic.AI_PROMPT}${
                    message.text === undefined ? '' : ` ${message.text}`
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

export async function* zipGenerators<T>(generators: AsyncGenerator<T>[]): AsyncGenerator<T[]> {
    while (true) {
        const res = await Promise.all(generators.map(generator => generator.next()))

        if (res.every(r => r.done)) {
            return
        }

        yield res.map(r => r.value)
    }
}

export async function* generatorWithErrorObserver<T>(
    generator: AsyncGenerator<T>,
    errorObserver: (error: unknown) => void
): AsyncGenerator<T> {
    try {
        while (true) {
            try {
                const res = await generator.next()
                if (res.done) {
                    return
                }
                yield res.value
            } catch (error: unknown) {
                errorObserver(error)
                throw error
            }
        }
    } finally {
        // The return value is optional according to MDN
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator/return
        // @ts-ignore
        generator.return()
    }
}

export async function* generatorWithTimeout<T>(
    generatorInput: AsyncGenerator<T> | Promise<AsyncGenerator<T>>,
    timeoutMs: number,
    abortController: AbortController
): AsyncGenerator<T> {
    const generator = await (generatorInput instanceof Promise
        ? generatorInput
        : Promise.resolve(generatorInput))
    try {
        if (timeoutMs === 0) {
            return
        }

        const timeoutPromise = createTimeout(timeoutMs).finally(() => {
            abortController.abort()
        })

        while (true) {
            const { value, done } = await Promise.race([generator.next(), timeoutPromise])

            if (value) {
                yield value
            }

            if (done) {
                break
            }
        }
    } finally {
        // The return value is optional according to MDN
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator/return
        // @ts-ignore
        generator.return()
    }
}

function createTimeout(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) =>
        setTimeout(() => reject(new TimeoutError('The request timed out')), timeoutMs)
    )
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
