import * as vscode from 'vscode'

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
export async function createJSONFile(
    extensionPath: string,
    configFileUri: vscode.Uri,
    isUserType: boolean
): Promise<void> {
    const sampleFileName = isUserType ? 'user-cody.json' : 'workspace-cody.json'
    const codyJsonPath = constructFileUri('resources/samples/' + sampleFileName, extensionPath)
    if (!configFileUri || !codyJsonPath) {
        void vscode.window.showErrorMessage('Failed to create cody.json file.')
        return
    }
    const decoded = await getFileContentText(codyJsonPath)
    await saveJSONFile(decoded, configFileUri)
}

// Add context from the sample files to the .vscode/cody.json file
export async function saveJSONFile(context: string, filePath: vscode.Uri, isSaveMode = false): Promise<void> {
    const workspaceEditor = new vscode.WorkspaceEdit()
    // Clear the file before writing to it
    workspaceEditor.deleteFile(filePath, { ignoreIfNotExists: true })
    workspaceEditor.createFile(filePath, { ignoreIfExists: isSaveMode })
    workspaceEditor.insert(filePath, new vscode.Position(0, 0), context)
    await vscode.workspace.applyEdit(workspaceEditor)
    // Save the file
    const doc = await vscode.workspace.openTextDocument(filePath)
    await doc.save()
    if (!isSaveMode) {
        await vscode.window.showTextDocument(filePath)
    }
}

// Create a file watcher for each .vscode/cody.json file
export function createFileWatchers(fsPath?: string): vscode.FileSystemWatcher | null {
    if (!fsPath) {
        return null
    }
    const fileName = '.vscode/cody.json'
    const watchPattern = new vscode.RelativePattern(fsPath, fileName)
    const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
    return watcher
}

export async function deleteFile(uri?: vscode.Uri): Promise<void> {
    if (!uri) {
        return
    }
    await vscode.workspace.fs.delete(uri)
}

export async function doesPathExist(filePath?: string): Promise<boolean> {
    try {
        return (filePath && !!(await vscode.workspace.fs.stat(vscode.Uri.file(filePath)))) || false
    } catch (error) {
        console.error('Failed to locate file', error)
        return false
    }
}

export function getFileNameFromPath(path: string): string | undefined {
    return path.split('/').pop()
}

export async function getFileToRemove(keys: string[]): Promise<string | undefined> {
    return vscode.window.showQuickPick(Array.from(keys))
}

export const outputWrapper = `
Output of \`{command}\` command:
\`\`\`sh
{output}
\`\`\``

export const createQuickPickSeperator = (label = '', detail = ''): vscode.QuickPickItem => ({ kind: -1, label, detail })
export const createQuickPickItem = (label = '', description = ''): vscode.QuickPickItem => ({ label, description })

export async function createUntitledFileWithExample(): Promise<void> {
    const content = 'Hello, world!'
    const uri = vscode.Uri.parse('untitled:')
    const document = await vscode.workspace.openTextDocument(uri)
    const editor = await vscode.window.showTextDocument(document)
    await editor.edit(editBuilder => {
        editBuilder.insert(new vscode.Position(0, 0), content)
    })
}

export async function getFileContentText(uri: vscode.Uri): Promise<string> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri)
        const content = new TextDecoder('utf-8').decode(bytes)
        return content
    } catch (error) {
        console.error('Failed to get decoded content from file uri', error)
        return ''
    }
}
