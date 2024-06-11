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
    // Create a copy of the generators array to avoid modifying the original
    const activeGenerators = generators.slice();

    // Loop until there are no more active generators
    while (activeGenerators.length > 0) {
        // Get the next value from each active generator
        const nextValues = await Promise.all(activeGenerators.map(async (generator) => {
            try {
                const { value, done } = await generator.next();
                // Return the value if the generator is not done, otherwise return undefined
                return done ? undefined : value;
            } catch (error) {
                // Log the error and remove the generator from the active list
                console.error(`Error in generator: ${error}`);
                activeGenerators.splice(activeGenerators.indexOf(generator), 1);
                return undefined;
            }
        }));

        // Filter out the undefined values from the next values
        const validValues = nextValues.filter((value) => value !== undefined);
        // If there are valid values, yield them as an array
        if (validValues.length > 0) {
            yield validValues;
        } else {
            // If there are no valid values, return from the generator
            return;
        }
    }
}


export async function* generatorWithErrorObserver<T>(
    generator: AsyncGenerator<T>,
    errorObserver: (error: unknown) => void
): AsyncGenerator<T> {
    try {
        // Iterate through the generator until it is done
        while (true) {
            try {
                // Get the next value from the generator
                const res = await generator.next()
                // If the generator is done, return
                if (res.done) {
                    return
                }
                // Yield the value from the generator
                yield res.value
            } catch (error: unknown) {
                // Call the error observer with the error
                errorObserver(error)
                // Rethrow the error
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
    generator: AsyncGenerator<T>,
    timeoutMs: number,
    abortController: AbortController
): AsyncGenerator<T> {
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
