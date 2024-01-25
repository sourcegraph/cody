import * as vscode from 'vscode'

//Help functions for the custom commands config file

// Create a file watcher for each .vscode/cody.json file
export function createFileWatchers(configFile?: vscode.Uri): vscode.FileSystemWatcher | null {
    if (!configFile) {
        return null
    }
    // Use the file as the first arg to RelativePattern because a file watcher will be set up on the
    // first arg given. If this is a directory with many files, such as the user's home directory,
    // it will cause a very large number of watchers to be created, which will exhaust the system.
    // This occurs even if the second arg is a relative file path with no wildcards.
    const watchPattern = new vscode.RelativePattern(configFile, '*')
    const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
    return watcher
}

// Create a .vscode/cody.json file in the root directory of the workspace
// or user's home directory
export async function createJSONFile(file: vscode.Uri): Promise<void> {
    await saveJSONFile({ commands: [] }, file)
}

// Add context from the sample files to the .vscode/cody.json file
export async function saveJSONFile(data: unknown, file: vscode.Uri): Promise<void> {
    try {
        const workspaceEditor = new vscode.WorkspaceEdit()
        // Clear the file before writing to it
        workspaceEditor.deleteFile(file, { ignoreIfNotExists: true })
        workspaceEditor.createFile(file, { ignoreIfExists: true })
        workspaceEditor.insert(file, new vscode.Position(0, 0), JSON.stringify(data, null, 2))
        await vscode.workspace.applyEdit(workspaceEditor)
        // Save the file
        const doc = await vscode.workspace.openTextDocument(file)
        await doc.save()
    } catch (error) {
        throw new Error(`Failed to save your Custom Commands to a JSON file: ${error}`)
    }
}

export const outputWrapper = `
Terminal output from the \`{command}\` command enclosed between <OUTPUT0412> tags:
<OUTPUT0412>
{output}
</OUTPUT0412>`

export async function openCustomCommandDocsLink(): Promise<void> {
    const uri = 'https://sourcegraph.com/docs/cody/custom-commands'
    await vscode.env.openExternal(vscode.Uri.parse(uri))
}

export function constructFileUri(fileName: string, basePath?: string): vscode.Uri | undefined {
    if (!basePath) {
        return undefined
    }
    const fileNamePaths = fileName.split('/')
    const rootDirUri = vscode.Uri.file(basePath)
    const codyJsonFilePath = vscode.Uri.joinPath(rootDirUri, ...fileNamePaths)
    return codyJsonFilePath
}
