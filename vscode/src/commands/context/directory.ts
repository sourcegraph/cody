import { truncateText, type ContextFile, MAX_CURRENT_FILE_TOKENS } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import * as vscode from 'vscode'
import { type URI, Utils } from 'vscode-uri'

/**
 * Gets context messages for the files in the given directory.
 * Or if no directory is given, gets the context messages for the files in the current directory.
 *
 * Loops through the files in the directory, gets the content of each file,
 * truncates it, and adds it to the context messages along with the file name.
 * Limits file sizes to 1MB.
 */
export async function getContextFileFromDirectory(directory?: URI): Promise<ContextFile[]> {
    const contextFiles: ContextFile[] = []

    const editor = getEditor()
    const document = editor?.active?.document

    if (!editor?.active || !document) {
        return []
    }

    const dirUri = directory || Utils.joinPath(document.uri, '..')

    try {
        const filesInDir = await vscode.workspace.fs.readDirectory(dirUri)
        // Filter out directories and dot files
        const filtered = filesInDir.filter(file => {
            const fileName = file[0]
            const fileType = file[1]
            const isDirectory = fileType === vscode.FileType.Directory
            const isHiddenFile = fileName.startsWith('.')

            return !isDirectory && !isHiddenFile
        })

        for (const [name, _type] of filtered) {
            // Get the context from each file
            const fileUri = Utils.joinPath(document.uri, name)

            // check file size before opening the file. skip file if it's larger than 1MB
            const fileSize = await vscode.workspace.fs.stat(fileUri)
            if (fileSize.size > 1000000 || !fileSize.size) {
                continue
            }

            const bytes = await vscode.workspace.fs.readFile(fileUri)
            const decoded = new TextDecoder('utf-8').decode(bytes)
            const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS)
            const range = new vscode.Range(0, 0, truncatedContent.split('\n').length, 0)

            const contextFile = {
                type: 'file',
                uri: fileUri,
                content: truncatedContent,
                source: 'editor',
                range,
            } as ContextFile

            contextFiles.push(contextFile)
        }

        return contextFiles
    } catch (error) {
        console.error(error)
        return []
    }
}
