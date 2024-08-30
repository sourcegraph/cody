import {
    type ContextItem,
    ContextItemSource,
    TokenCounterUtils,
    contextFiltersProvider,
    logError,
    toRangeData,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { type URI, Utils } from 'vscode-uri'
import { getEditor } from '../../editor/active-editor'

/**
 * Gets context messages for the files in the given directory.
 * Or if no directory is given, gets the context messages for the files in the current directory.
 *
 * Loops through the files in the directory, gets the content of each file,
 * truncates it, and adds it to the context messages along with the file name.
 * Limits file sizes to 1MB.
 */
export async function getContextFileFromDirectory(directory?: URI): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.directory', async () => {
        const contextFiles: ContextItem[] = []

        const editor = getEditor()
        const document = editor?.active?.document

        if (!editor?.active || !document) {
            return []
        }

        try {
            // Use current directory if no directory uri is provided
            const dirUri = directory ?? Utils.joinPath(document.uri, '..')
            // Get the files in the directory
            const filesInDir = await vscode.workspace.fs.readDirectory(dirUri)
            // Filter out directories and dot files
            const filtered = filesInDir
                .filter(file => {
                    const fileName = file[0]
                    const fileType = file[1]
                    const isDirectory = fileType === vscode.FileType.Directory
                    const isHiddenFile = fileName.startsWith('.')

                    return !isDirectory && !isHiddenFile
                })
                .sort((a, b) => a[0].localeCompare(b[0])) // sort for determinism

            // Get the context from each file in the directory
            for (const [name, _type] of filtered) {
                // Reconstruct the file URI with the file name and directory URI
                const fileUri = Utils.joinPath(dirUri, name)

                if (await contextFiltersProvider.instance!.isUriIgnored(fileUri)) {
                    continue
                }

                // check file size before opening the file. skip file if it's larger than 1MB
                const fileSize = await vscode.workspace.fs.stat(fileUri)
                if (fileSize.size > 1000000 || !fileSize.size) {
                    continue
                }

                const bytes = await vscode.workspace.fs.readFile(fileUri)
                const content = new TextDecoder('utf-8').decode(bytes)
                const range = new vscode.Range(0, 0, content.split('\n').length - 1 || 0, 0)
                const size = await TokenCounterUtils.countTokens(content)

                contextFiles.push({
                    type: 'file',
                    uri: fileUri,
                    content,
                    source: ContextItemSource.Editor,
                    range: toRangeData(range),
                    size,
                })

                // Limit the number of files to 10
                const maxResults = 10
                if (contextFiles.length >= maxResults) {
                    return contextFiles
                }
            }
        } catch (error) {
            logError('getContextFileFromDirectory', 'failed', { verbose: error })
        }

        return contextFiles
    })
}
