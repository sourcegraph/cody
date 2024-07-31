import {
    ContextItemSource,
    type ContextItemTree,
    contextFiltersProvider,
    uriBasename,
    uriDirname,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'
import { doesFileExist } from '../utils/workspace-files'

export async function getAncestorProjectRootDir(signal?: AbortSignal): Promise<ContextItemTree | null> {
    return wrapInActiveSpan('commands.context.ancestorProjectRoot', async span => {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? []
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null
        }

        const editor = getEditor()
        const document = editor?.active?.document
        if (!document) {
            throw new Error('No active editor')
        }

        if (await contextFiltersProvider.isUriIgnored(document.uri)) {
            return null
        }

        signal?.throwIfAborted()

        // Traverse up the directory tree until we find a project root.
        let cur = document.uri
        let containingWorkspaceFolder: vscode.WorkspaceFolder | undefined
        let isWorkspaceRoot = false
        while (true) {
            const parent = uriDirname(cur)

            containingWorkspaceFolder = vscode.workspace.getWorkspaceFolder(parent)
            if (!containingWorkspaceFolder) {
                // Stop if we've traversed outside all workspace folders.
                break
            }
            if (containingWorkspaceFolder.uri.toString() === cur.toString()) {
                // Stop if we've traversed to a workspace folder, and use that folder.
                isWorkspaceRoot = true
                cur = parent
                break
            }
            if (parent.toString() === cur.toString()) {
                break // Stop if we've reached the root dir on the file system.
            }

            cur = parent

            // TODO!(sqs): be smarter about identifying workspaces than just looking for a package.json
            const PROJECT_ROOT_FILES = ['package.json', 'BUILD.bazel', 'WORKSPACE', 'go.mod']
            const stats = await Promise.all(
                PROJECT_ROOT_FILES.map(f => vscode.Uri.joinPath(cur, f)).map(doesFileExist)
            )
            if (stats.some(stat => stat)) {
                // Stop if we've found any project root files.
                break
            }

            signal?.throwIfAborted()
        }

        return cur
            ? ({
                  type: 'tree',
                  uri: cur,
                  isWorkspaceRoot,
                  workspaceFolder: containingWorkspaceFolder?.uri ?? null,
                  source: ContextItemSource.Editor,
                  content: null,
                  name: uriBasename(cur),
              } satisfies ContextItemTree)
            : null
    })
}
