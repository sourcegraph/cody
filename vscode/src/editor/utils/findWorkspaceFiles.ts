import * as vscode from 'vscode'
import { getExcludePattern } from '../../cody-ignore/context-filter'

/**
 * Find all files in all workspace folders, respecting the user's `files.exclude`, `search.exclude`,
 * and other exclude settings. The intent is to match the files shown by VS Code's built-in `Go to
 * File...` command.
 */
export async function findWorkspaceFiles(
    cancellationToken?: vscode.CancellationToken
): Promise<ReadonlyArray<vscode.Uri>> {
    return (
        await Promise.all(
            (vscode.workspace.workspaceFolders ?? [null]).map(async workspaceFolder =>
                vscode.workspace.findFiles(
                    workspaceFolder ? new vscode.RelativePattern(workspaceFolder, '**') : '',
                    await getExcludePattern(workspaceFolder),
                    undefined,
                    cancellationToken
                )
            )
        )
    ).flat()
}
