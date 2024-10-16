import { appendFileSync } from 'node:fs'

import * as vscode from 'vscode'

import { getConfiguration } from './configuration'

export const CODY_OUTPUT_CHANNEL = 'Cody by Sourcegraph'

/**
 * Provides a default output channel and creates per-feature output channels when needed.
 */
class OutputChannelManager {
    public defaultOutputChannel = vscode.window.createOutputChannel(CODY_OUTPUT_CHANNEL, 'json')
    private outputChannels: Map<string, vscode.OutputChannel> = new Map()

    getOutputChannel(feature: string): vscode.OutputChannel | undefined {
        if (!this.outputChannels.has(feature) && process.env.NODE_ENV === 'development') {
            const channel = vscode.window.createOutputChannel(`Cody ${feature}`, 'json')
            this.outputChannels.set(feature, channel)
        }

        return this.outputChannels.get(feature)
    }

    appendLine(text: string, feature?: string): void {
        // Always log to the default output channel
        this.defaultOutputChannel?.appendLine(text)

        // Also log to the feature-specific output channel if available
        if (feature) {
            const channel = this.getOutputChannel(feature)
            channel?.appendLine(text)
        }

        // Write to log file if needed
        const path = process.env.CODY_LOG_FILE
        if (path) {
            appendFileSync(path, text + '\n')
        }
    }
}

export const outputChannelManager = new OutputChannelManager()

export class Logger {
    /**
     * A separate output channel will be created if the feature label is provided.
     */
    constructor(private feature?: string) {}

    logDebug(filterLabel: string, text: string, ...args: unknown[]): void {
        this.log({
            level: 'debug',
            feature: this.feature,
            filterLabel,
            text,
            args,
        })
    }

    logError(filterLabel: string, text: string, ...args: unknown[]): void {
        this.log({
            level: 'error',
            feature: this.feature,
            filterLabel,
            text,
            args,
        })
    }

    log({
        level,
        feature,
        filterLabel,
        text,
        args = [],
    }: {
        level: 'debug' | 'error'
        filterLabel: string
        text: string
        feature?: string
        args?: unknown[]
    }): void {
        const workspaceConfig = vscode.workspace.getConfiguration()
        const { debugFilter, debugVerbose } = getConfiguration(workspaceConfig)

        if (level === 'debug' && debugFilter && !debugFilter.test(filterLabel)) {
            return
        }

        const message = formatMessage({
            prefix: '█ ',
            feature,
            filterLabel,
            text,
            args,
            debugVerbose,
        })

        outputChannelManager.appendLine(message, feature)
    }
}

export const outputChannelLogger = new Logger()

/**
 * @deprecated Use outputChannelLogger.logDebug instead.
 */
export function logDebug(filterLabel: string, text: string, ...args: unknown[]): void {
    outputChannelLogger.logDebug(filterLabel, text, ...args)
}

/**
 * @deprecated Use outputChannelLogger.logError instead.
 */
export function logError(filterLabel: string, text: string, ...args: unknown[]): void {
    outputChannelLogger.logError(filterLabel, text, ...args)
}

/**
 * Formats log messages based on provided parameters.
 */
function formatMessage({
    prefix,
    feature,
    filterLabel,
    text,
    args,
    debugVerbose,
}: {
    prefix: string
    feature?: string
    filterLabel: string
    text: string
    args: unknown[]
    debugVerbose: boolean
}): string {
    const featureLabel = feature ? `${feature}:` : ''
    const messageParts: string[] = [`${prefix}${featureLabel}${filterLabel} ${text}:`]

    if (args.length > 0) {
        const lastArg = args.at(-1)
        const isVerboseLastArg = lastArg && typeof lastArg === 'object' && 'verbose' in lastArg

        // Exclude the last argument if it's verbose
        const argsToLog = isVerboseLastArg ? args.slice(0, -1) : args

        // Append non-verbose arguments
        if (argsToLog.length > 0) {
            messageParts.push(argsToLog.join(' '))
        }

        // Append verbose content if debugVerbose is true
        if (isVerboseLastArg && debugVerbose) {
            messageParts.push(JSON.stringify(lastArg.verbose, null, 2))
        }
    }

    return messageParts.join(' ')
}
