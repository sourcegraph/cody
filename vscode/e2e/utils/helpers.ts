import path from 'node:path'
import type { TestInfo } from '@playwright/test'

export const CODY_ROOT_DIR = process.env.CODY_ROOT_DIR ?? path.resolve(__dirname, '..', '..', '..')
export const CODY_VSCODE_ROOT_DIR =
    process.env.CODY_VSCODE_ROOT_DIR ?? path.resolve(__dirname, '..', '..')
/**
 * Stretches the test with at most the `max` amount of ms but never more than
 * needed to finish the operation. This way you can effectively nullify the time
 * a certain operation takes.
 */
export async function stretchTimeout<R>(
    fn: () => Promise<R>,
    {
        max,
        testInfo,
    }: {
        max: number
        testInfo: TestInfo
    }
): Promise<R> {
    // Warning: For some reason Playwright doesn't report the modified timeout
    // correctly so we can't rely on it being updated after we call setTimeout
    const timeout = testInfo.timeout
    if (timeout === 0) {
        return await fn()
    }
    testInfo.setTimeout(timeout + max)
    const startTime = Date.now()
    try {
        return await fn()
    } finally {
        const totalTime = Date.now() - startTime
        testInfo.setTimeout(timeout + totalTime)
    }
}

export async function retry<R>(fn: () => Promise<R>, retries = 5, delay = 1000): Promise<R> {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn()
        } catch (err) {
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay))
            } else {
                throw err
            }
        }
    }
    throw new Error('Could not execute retryable function')
}
