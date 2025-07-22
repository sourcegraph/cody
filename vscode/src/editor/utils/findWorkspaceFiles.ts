import * as vscode from 'vscode'
import { getExcludePattern } from '../../cody-ignore/context-filter'

/**
 * Find all files in all workspace folders, respecting the user's `files.exclude`, `search.exclude`,
 * and other exclude settings. The intent is to match the files shown by VS Code's built-in `Go to
 * File...` command.
 */
export async function findWorkspaceFiles(): Promise<ReadonlyArray<vscode.Uri>> {
    const excludePatterns = await Promise.all(
        vscode.workspace.workspaceFolders?.flatMap(workspaceFolder => {
            return getExcludePattern(workspaceFolder)
        }) ?? []
    )

    return vscode.workspace.findFiles('**/*', `{${excludePatterns.join(',')}}`)
}
