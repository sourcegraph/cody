import * as vscode from 'vscode'

import { ConfigFileName } from '..'

export function constructFileUri(fileName: string, rootDirPath?: string): vscode.Uri | undefined {
    if (!rootDirPath) {
        return undefined
    }
    const fileNamePaths = fileName.split('/')
    const rootDirUri = vscode.Uri.file(rootDirPath)
    const codyJsonFilePath = vscode.Uri.joinPath(rootDirUri, ...fileNamePaths)
    return codyJsonFilePath
}

// Create a .vscode/cody.json file in the root directory of the workspace or user's home directory using the sample files
export async function createJSONFile(configFileUri: vscode.Uri): Promise<void> {
    await saveJSONFile({ commands: [] }, configFileUri)
}

// Add context from the sample files to the .vscode/cody.json file
export async function saveJSONFile(data: unknown, filePath: vscode.Uri): Promise<void> {
    try {
        const workspaceEditor = new vscode.WorkspaceEdit()
        // Clear the file before writing to it
        workspaceEditor.deleteFile(filePath, { ignoreIfNotExists: true })
        workspaceEditor.createFile(filePath, { ignoreIfExists: true })
        workspaceEditor.insert(filePath, new vscode.Position(0, 0), JSON.stringify(data, null, 2))
        await vscode.workspace.applyEdit(workspaceEditor)
        // Save the file
        const doc = await vscode.workspace.openTextDocument(filePath)
        await doc.save()
    } catch (error) {
        throw new Error(`Failed to save your Custom Commands to a JSON file: ${error}`)
    }
}

// Create a file watcher for each .vscode/cody.json file
export function createFileWatchers(fsPath?: string): vscode.FileSystemWatcher | null {
    const fileUri = constructFileUri(ConfigFileName.vscode, fsPath)
    if (!fileUri) {
        return null
    }
    // Use the file as the first arg to RelativePattern because a file watcher will be set up on the
    // first arg given. If this is a directory with many files, such as the user's home directory,
    // it will cause a very large number of watchers to be created, which will exhaust the system.
    // This occurs even if the second arg is a relative file path with no wildcards.
    const watchPattern = new vscode.RelativePattern(fileUri, '*')
    const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
    return watcher
}

export async function deleteFile(uri?: vscode.Uri): Promise<void> {
    if (!uri) {
        return
    }
    await vscode.workspace.fs.delete(uri)
}

export const createQuickPickItem = (label = '', description = '', alwaysShow = false): vscode.QuickPickItem => ({
    label,
    description,
    alwaysShow,
})

export async function getFileContentText(uri: vscode.Uri): Promise<string> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri)
        const content = new TextDecoder('utf-8').decode(bytes)
        return content
    } catch {
        return ''
    }
}

export const outputWrapper = `
Here is the output of \`{command}\` command from my terminal inside <output> tags:
<output>
{output}
</output>`

export async function openCustomCommandDocsLink(): Promise<void> {
    const uri = 'https://sourcegraph.com/docs/cody/custom-commands'
    await vscode.env.openExternal(vscode.Uri.parse(uri))
}
