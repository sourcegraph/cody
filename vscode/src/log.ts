import * as vscode from 'vscode'

import { CompletionLogger } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import {
    CompletionParameters,
    CompletionResponse,
    Event,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { getConfiguration } from './configuration'

export const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Cody by Sourcegraph', 'json')

/**
 * Logs a debug message to the "Cody by Sourcegraph" output channel.
 *
 * Usage:
 *
 *   logDebug('label', 'this is a message')
 *   logDebug('label', 'this is a message', 'some', 'args')
 *   logDebug('label', 'this is a message', 'some', 'args', { verbose: 'verbose info goes here' })
 */
export function logDebug(filterLabel: string, text: string, ...args: unknown[]): void {
    log('error', filterLabel, text, ...args)
}

/**
 * Logs an error message to the "Cody by Sourcegraph" output channel.
 *
 * Usage:
 *
 *   logError('label', 'this is an error')
 *   logError('label', 'this is an error', 'some', 'args')
 *   logError('label', 'this is an error', 'some', 'args', { verbose: 'verbose info goes here' })
 */
export function logError(filterLabel: string, text: string, ...args: unknown[]): void {
    log('error', filterLabel, text, ...args)
}

/**
 *
 * There are three config settings that alter the behavior of this function.
 *
 * A window refresh may be needed if these settings are changed for the behavior change to take
 * effect.
 *
 * - cody.debug.enabled: toggles debug logging on or off
 * - cody.debug.filter: sets a regex filter that opts-in messages with labels matching the regex
 * - cody.debug.verbose: prints out the text in the `verbose` field of the last argument
 *
 */
function log(level: 'debug' | 'error', filterLabel: string, text: string, ...args: unknown[]): void {
    const workspaceConfig = vscode.workspace.getConfiguration()
    const config = getConfiguration(workspaceConfig)

    const debugEnable = process.env.CODY_DEBUG_ENABLE === 'true' || config.debugEnable

    if (!outputChannel || (level === 'debug' && !debugEnable)) {
        return
    }

    if (level === 'debug' && config.debugFilter && !config.debugFilter.test(filterLabel)) {
        return
    }

    const PREFIX = '█ '

    if (args.length === 0) {
        outputChannel.appendLine(`${PREFIX}${filterLabel}: ${text}`)
        return
    }

    const lastArg = args.at(-1)
    if (lastArg && typeof lastArg === 'object' && 'verbose' in lastArg) {
        if (config.debugVerbose) {
            outputChannel.appendLine(
                `${PREFIX}${filterLabel}: ${text} ${args.slice(0, -1).join(' ')} ${JSON.stringify(
                    lastArg.verbose,
                    null,
                    2
                )}`
            )
        } else {
            outputChannel.appendLine(`${PREFIX}${filterLabel}: ${text} ${args.slice(0, -1).join(' ')}`)
        }
        return
    }

    outputChannel.appendLine(`${PREFIX}${filterLabel}: ${text} ${args.join(' ')}`)
}

export const logger: CompletionLogger = {
    startCompletion(params: CompletionParameters | {}, endpoint: string) {
        const workspaceConfig = vscode.workspace.getConfiguration()
        const config = getConfiguration(workspaceConfig)

        if (!config.debugEnable) {
            return undefined
        }

        const start = Date.now()
        const type = 'prompt' in params ? 'code-completion' : 'messages' in params ? 'completion' : 'code-completion'
        let hasFinished = false
        let lastCompletion = ''

        function onError(err: string, rawError?: unknown): void {
            if (hasFinished) {
                return
            }
            hasFinished = true

            if (process.env.NODE_ENV === 'development') {
                console.error(rawError)
            }

            logError(
                'CompletionLogger:onError',
                JSON.stringify({
                    type,
                    endpoint,
                    status: 'error',
                    duration: Date.now() - start,
                    err,
                }),
                { verbose: { params } }
            )
        }

        function onComplete(result: string | CompletionResponse | string[] | CompletionResponse[]): void {
            if (hasFinished) {
                return
            }
            hasFinished = true

            logDebug(
                'CompletionLogger:onComplete',
                JSON.stringify({
                    type,
                    endpoint,
                    status: 'success',
                    duration: Date.now() - start,
                }),
                { verbose: { result, params } }
            )
        }

        function onEvents(events: Event[]): void {
            for (const event of events) {
                switch (event.type) {
                    case 'completion':
                        lastCompletion = event.completion
                        break
                    case 'error':
                        onError(event.error)
                        break
                    case 'done':
                        onComplete(lastCompletion)
                        break
                }
            }
        }

        return {
            onError,
            onComplete,
            onEvents,
        }
    },
}
