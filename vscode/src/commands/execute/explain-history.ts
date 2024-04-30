import { type SpawnOptionsWithoutStdio, spawn } from 'node:child_process'
import path from 'node:path'
import {
    type ContextItem,
    ContextItemSource,
    PromptString,
    isFileURI,
    logDebug,
    logError,
    ps,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'
import type { ChatCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'
import { executeChat } from './ask'

export async function executeExplainHistoryCommand(
    args: Partial<CodyCommandArgs> = {}
): Promise<ChatCommandResult | undefined> {
    logDebug('executeExplainHistoryCommand', 'executing', args)

    try {
        // vscode git extension API doesn't offer a way to run git log with trace
        // arguments. So we directly spawn git log to run against the active document.
        const logArguments = getLogArguments(args)
        if (!logArguments) {
            return undefined
        }

        logDebug('executeExplainHistoryCommand', 'computed log arguments', JSON.stringify(logArguments))

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
            type: 'chat',
            session: await executeChat({
                text: prompt,
                submitType: 'user-newchat',
                addEnhancedContext: false,
                contextFiles,
                source: args?.source,
            }),
        }
    } catch (error) {
        logError('executeExplainHistoryCommand', 'error fetching history context', error)
        vscode.window.showErrorMessage(`Error fetching history context: ${error}`)
        return undefined
    }
}

interface LogArguments {
    symbolText: PromptString
    logArgs: string[]
    cwd: string
}

function getLogArguments(args: Pick<CodyCommandArgs, 'range'>): LogArguments | undefined {
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

    return {
        symbolText,
        logArgs: [`-L:${symbolText.toString()}:${doc.uri.fsPath}`],
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
