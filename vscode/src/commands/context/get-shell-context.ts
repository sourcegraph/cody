import { type ContextFile, MAX_CURRENT_FILE_TOKENS, truncateText } from '@sourcegraph/cody-shared'
import { commandTools } from '../utils/tools-provider'
import * as vscode from 'vscode'

export async function getContextFileFromShell(shell: string): Promise<ContextFile | undefined> {
    const output = await commandTools.exeCommand(shell)
    if (!output) {
        return
    }

    const truncated = truncateText(output?.trim(), MAX_CURRENT_FILE_TOKENS)

    return {
        type: 'file',
        content: truncated,
        title: 'Terminal Output',
        uri: vscode.Uri.file('terminal-output'),
        source: 'terminal',
    } as ContextFile
}
