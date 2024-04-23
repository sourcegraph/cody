import * as vscode from 'vscode'
import { doesFileExist } from './workspace-files'

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

/**
 * Creates a Cody JSON file at the specified URI if it does not already exist.
 *
 * @param uri The URI of the Cody JSON file to create.
 * @returns A Promise that resolves when the file has been created.
 */
export async function tryCreateCodyJSON(uri: vscode.Uri): Promise<void> {
    await doesFileExist(uri).then(async exists => {
        if (exists) {
            return
        }
        // TODO (bee) provide example commands
        await writeToCodyJSON(uri, {})
    })
}

/**
 * Writes the provided data to a Cody JSON file at the specified URI.
 *
 * @param file The URI of the Cody JSON file to write to.
 * @param data The data to write to the Cody JSON file.
 * @returns A Promise that resolves when the file has been written.
 * @throws Error if there is a failure saving the file.
 */
export async function writeToCodyJSON(file: vscode.Uri, data: unknown): Promise<void> {
    try {
        const workspaceEditor = new vscode.WorkspaceEdit()
        workspaceEditor.createFile(file, {
            overwrite: true,
            ignoreIfExists: true,
        })
        workspaceEditor.insert(file, new vscode.Position(0, 0), JSON.stringify(data, null, 2))
        await vscode.workspace.applyEdit(workspaceEditor)
        // Save the file
        const doc = await vscode.workspace.openTextDocument(file)
        await doc.save()
    } catch (error) {
        throw new Error(`Failed to save your Custom Commands to a JSON file: ${error}`)
    }
}
