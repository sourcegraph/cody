import { type ContextItem, logError, wrapInActiveSpan } from '@sourcegraph/cody-shared'
import { CancellationTokenSource, workspace } from 'vscode'
import { createContextFile } from '../utils/create-context-file'
import { getDocText } from '../utils/workspace-files'

/**
 * Wrap the vscode findVSCodeFiles function to return context files.
 * Gets workspace files context based on global pattern, exclude pattern and max results.
 *
 * @param globalPattern - Glob pattern to search files
 * @param excludePattern - Glob pattern to exclude files
 * @param maxResults - Max number of results to return
 * @returns Promise resolving to array of context files
 */
export async function getWorkspaceFilesContext(
    globalPattern: string,
    excludePattern?: string,
    maxResults = 5
): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.workspace', async span => {
        // the default exclude pattern excludes dotfiles, node_modules, and snap directories
        const excluded = excludePattern || '**/{.*,node_modules,snap*}/**'

        const contextFiles: ContextItem[] = []

        // set cancellation token to time out after 20s
        const token = new CancellationTokenSource()
        setTimeout(() => {
            token.cancel()
        }, 20000)

        try {
            const results = await workspace.findFiles(globalPattern, excluded, maxResults, token.token)

            for (const result of results) {
                const decoded = await getDocText(result)
                const contextFile = await createContextFile(result, decoded)

                if (contextFile) {
                    contextFiles.push(contextFile)
                }
            }

            return contextFiles
        } catch (error) {
            logError('getWorkspaceFilesContext failed', `${error}`)

            return contextFiles
        }
    })
}
