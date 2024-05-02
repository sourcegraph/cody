import { type SpawnOptionsWithoutStdio, spawn } from 'node:child_process'
import path from 'node:path'
import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    ContextItemSource,
    PromptString,
    isFileURI,
    logDebug,
    ps,
    telemetryRecorder,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'
import type { ChatCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'
import { type ExecuteChatArguments, executeChat } from './ask'

async function explainHistoryCommand(
    span: Span,
    args?: Partial<CodyCommandArgs>
): Promise<ExecuteChatArguments | undefined> {
    // vscode git extension API doesn't offer a way to run git log with trace
    // arguments. So we directly spawn git log to run against the active document.
    const logArguments = getLogArguments(args)
    if (!logArguments) {
        return undefined
    }

    logDebug('explainHistoryCommand', 'computed log arguments', JSON.stringify(logArguments))

    const output = await spawnGetStdout('git', ['log', ...logArguments.logArgs], {
        cwd: logArguments.cwd,
    })

    const prompt = ps`Explain the history of the function \`${logArguments.symbolText}\`.`
    const contextFiles: ContextItem[] = [
        {
            type: 'file',
            content: output,
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
        if (!sessionArgs) {
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

function getLogArguments(args?: Pick<CodyCommandArgs, 'range'>): LogArguments | undefined {
    const activeEditor = getEditor().active
    const doc = activeEditor?.document
    if (!doc || !isFileURI(doc.uri)) {
        return undefined
    }

    const symbolRange = doc.getWordRangeAtPosition((args?.range ?? activeEditor.selection).start)
    if (!symbolRange) {
        return undefined
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

async function spawnGetStdout(
    command: string,
    args: readonly string[],
    opts: SpawnOptionsWithoutStdio
): Promise<string> {
    const childProcess = spawn(command, args, opts)

    let output = ''
    let error = ''
    childProcess.stdout.on('data', data => {
        output += data.toString()
    })
    childProcess.stderr.on('data', data => {
        error += data.toString()
    })

    await new Promise<void>((resolve, reject) => {
        childProcess.on('close', code => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(`Command ${command} failed with code ${code}: ${error}`))
            }
        })
    })

    return output
}
