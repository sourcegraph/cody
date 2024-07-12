import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    PromptString,
    logDebug,
    logError,
    ps,
    telemetryRecorder,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ChatCommandResult } from '../../CommandResult'
import { getEditor } from '../../editor/active-editor'
import type { CommandsProvider } from '../services/provider'
import type { CodyCommandArgs } from '../types'
import { type ExecuteChatArguments, executeChat } from './ask'

/**
 * Wraps up the reasons why a explain history command fails. This makes it easy
 * to have consistent telemetry and reporting to the user.
 */
interface FailedExplainResult {
    level: 'error' | 'warn'
    reason: 'no-file' | 'no-word' | 'git-no-match' | 'git-error'
    message: string
}

async function explainHistoryCommand(
    span: Span,
    commandsProvider: CommandsProvider,
    args?: Partial<CodyCommandArgs>
): Promise<ExecuteChatArguments | FailedExplainResult> {
    // vscode git extension API doesn't offer a way to run git log with trace
    // arguments. So we directly spawn git log to run against the active document.
    const historyOptions = getHistoryOptions(args)
    if (isFailure(historyOptions)) {
        return historyOptions
    }

    logDebug('explainHistoryCommand', 'computed history options', JSON.stringify(historyOptions))

    let contextFiles: ContextItem[] = []
    try {
        contextFiles = await commandsProvider.history(historyOptions.uri, historyOptions)
        if (contextFiles.length === 0) {
            return {
                level: 'warn',
                reason: 'git-no-match',
                message: `history search does not support searching for the symbol ${historyOptions.symbolText.toString()}`,
            }
        }
    } catch (error) {
        return {
            level: 'error',
            reason: 'git-error',
            message: `Unexpected error fetching history: ${error}`,
        }
    }

    const prompt = ps`Explain the history of the function \`${historyOptions.symbolText}\`.`

    return {
        text: prompt,
        submitType: 'user-newchat',
        addEnhancedContext: false,
        contextFiles,
        source: args?.source,
    }
}

export async function executeExplainHistoryCommand(
    commandsProvider: CommandsProvider,
    args: Partial<CodyCommandArgs> = {}
): Promise<ChatCommandResult | undefined> {
    return wrapInActiveSpan('command.explain-history', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeExplainHistoryCommand', 'executing', args)
        telemetryRecorder.recordEvent('cody.command.explain-history', 'executed', {
            interactionID: args?.requestID,
            privateMetadata: {
                requestID: args?.requestID,
                source: args?.source,
                traceId: span.spanContext().traceId,
            },
        })

        const sessionArgs = await explainHistoryCommand(span, commandsProvider, args)

        if (isFailure(sessionArgs)) {
            handleFailure(span, sessionArgs)
            return undefined
        }

        return {
            type: 'chat',
            session: await executeChat(sessionArgs),
        }
    })
}

interface HistoryOptions {
    uri: vscode.Uri
    symbolText: PromptString
    funcname: string
    maxCount: number
}

function getHistoryOptions(args?: Pick<CodyCommandArgs, 'range'>): HistoryOptions | FailedExplainResult {
    const activeEditor = getEditor().active
    const doc = activeEditor?.document
    if (!doc) {
        return {
            level: 'warn',
            reason: 'no-file',
            message: 'You must be editing a file to use this command.',
        }
    }

    const symbolRange = doc.getWordRangeAtPosition((args?.range ?? activeEditor.selection).start)
    if (!symbolRange) {
        return {
            level: 'warn',
            reason: 'no-word',
            message: 'Your cursor must be on a word to use this command.',
        }
    }

    const symbolText = PromptString.fromDocumentText(doc, symbolRange)

    return {
        uri: doc.uri,
        symbolText,
        funcname: symbolText.toString(),
        maxCount: 15,
    }
}

function isFailure(object: any): object is FailedExplainResult {
    return 'reason' in object && 'message' in object
}

function handleFailure(span: Span, result: FailedExplainResult) {
    span.setAttribute('failure-reason', result.reason)
    if (result.level === 'error') {
        logError(
            'executeExplainHistoryCommand',
            'error fetching history context',
            result.reason,
            result.message
        )
        const errorMessage = `Error fetching history context: ${result.reason}: ${result.message}`
        vscode.window.showErrorMessage(errorMessage)
        // throw an error so that wrapInActiveSpan correctly annotates this trace as failed.
        throw new Error(errorMessage)
    }

    logDebug(
        'executeExplainHistoryCommand',
        'failed to explaining history context',
        result.reason,
        result.message
    )
    vscode.window.showWarningMessage(
        `Could not compute symbol history: ${result.reason}: ${result.message}`
    )
}
