import { type SpawnOptionsWithoutStdio, spawn } from 'node:child_process'
import path from 'node:path'
import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    ContextItemSource,
    PromptString,
    isFileURI,
    logDebug,
    logError,
    ps,
    telemetryRecorder,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'
import type { ChatCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'
import { type ExecuteChatArguments, executeChat } from './ask'

/**
 * Wraps up the reasons why a explain history command fails. This makes it easy
 * to have consistent telemetry and reporting to the user.
 */
interface FailedExplainResult {
    level: 'error' | 'warn'
    reason: 'no-file' | 'no-word' | 'git-no-match' | 'git-unknown'
    message: string
}

async function explainHistoryCommand(
    span: Span,
    args?: Partial<CodyCommandArgs>
): Promise<ExecuteChatArguments | FailedExplainResult> {
    // vscode git extension API doesn't offer a way to run git log with trace
    // arguments. So we directly spawn git log to run against the active document.
    const logArguments = getLogArguments(args)
    if (isFailure(logArguments)) {
        return logArguments
    }

    logDebug('explainHistoryCommand', 'computed log arguments', JSON.stringify(logArguments))

    const logResult = await spawnAsync('git', ['log', ...logArguments.logArgs], {
        cwd: logArguments.cwd,
    })

    if (logResult.code !== 0) {
        logDebug('explainHistoryCommand', 'git log failed', JSON.stringify(logResult))
        return parseGitLogFailure(logArguments, logResult)
    }

    const prompt = ps`Explain the history of the function \`${logArguments.symbolText}\`.`
    const contextFiles: ContextItem[] = [
        {
            type: 'file',
            content: logResult.stdout,
            title: 'Terminal Output',
            uri: vscode.Uri.file('terminal-output'),
            source: ContextItemSource.Terminal,
        },
    ]

    return {
        text: prompt,
        submitType: 'user-newchat',
        addEnhancedContext: false,
        contextFiles,
        source: args?.source,
    }
}

export async function executeExplainHistoryCommand(
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

        const sessionArgs = await explainHistoryCommand(span, args)

        if (isFailure(sessionArgs)) {
            span.setAttribute('failure-reason', sessionArgs.reason)
            if (sessionArgs.level === 'error') {
                logError(
                    'executeExplainHistoryCommand',
                    'error fetching history context',
                    sessionArgs.reason,
                    sessionArgs.message
                )
                const errorMessage = `Error fetching history context: ${sessionArgs.reason}: ${sessionArgs.message}`
                vscode.window.showErrorMessage(errorMessage)
                // throw an error so that wrapInActiveSpan correctly annotates this trace as failed.
                throw new Error(errorMessage)
            }

            logDebug(
                'executeExplainHistoryCommand',
                'failed to explaining history context',
                sessionArgs.reason,
                sessionArgs.message
            )
            vscode.window.showWarningMessage(
                `Could not compute symbol history: ${sessionArgs.reason}: ${sessionArgs.message}`
            )
            return undefined
        }

        return {
            type: 'chat',
            session: await executeChat(sessionArgs),
        }
    })
}

interface LogArguments {
    symbolText: PromptString
    logArgs: string[]
    cwd: string
}

function getLogArguments(args?: Pick<CodyCommandArgs, 'range'>): LogArguments | FailedExplainResult {
    const activeEditor = getEditor().active
    const doc = activeEditor?.document
    if (!doc || !isFileURI(doc.uri)) {
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

    const logArgs = [
        // -L:<funcname>:<file> traces the evolution of the function name regex
        // <funcname>, within the <file>. This relies on reasonable heuristics
        // built into git to find function bodies. However, the heuristics often
        // fail so we should switch to computing the line region ourselves.
        // https://git-scm.com/docs/git-log#Documentation/git-log.txt--Lltfuncnamegtltfilegt
        '-L:' + symbolText.toString() + ':' + doc.uri.fsPath,
        // Limit output due to context window size. This was unscientifically
        // picked, a better implementation would parse the output and truncate
        // to the context window size.
        '--max-count=15',
    ]

    return {
        symbolText,
        logArgs,
        cwd: path.dirname(doc.uri.fsPath),
    }
}

function isFailure(object: any): object is FailedExplainResult {
    return 'reason' in object && 'message' in object
}

function parseGitLogFailure(logArguments: LogArguments, result: SpawnResult): FailedExplainResult {
    if (result.stderr.includes('no match')) {
        return {
            level: 'warn',
            reason: 'git-no-match',
            message: `git does support searching for the symbol ${logArguments.symbolText.toString()}`,
        }
    }
    return {
        level: 'error',
        reason: 'git-unknown',
        message: `git log failed with exit code ${result.code}: ${result.stderr}`,
    }
}

interface SpawnResult {
    stdout: string
    stderr: string
    code: number
}

async function spawnAsync(
    command: string,
    args: readonly string[],
    opts: SpawnOptionsWithoutStdio
): Promise<SpawnResult> {
    const childProcess = spawn(command, args, opts)

    let stdout = ''
    let stderr = ''
    childProcess.stdout.on('data', data => {
        stdout += data.toString()
    })
    childProcess.stderr.on('data', data => {
        stderr += data.toString()
    })

    let code = -1
    await new Promise<void>((resolve, reject) => {
        childProcess.on('close', returnCode => {
            if (returnCode === null) {
                reject(new Error('Process closed with null return code'))
            } else {
                code = returnCode
                resolve()
            }
        })
    })

    return {
        stdout,
        stderr,
        code,
    }
}
