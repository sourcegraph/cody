import * as vscode from 'vscode'

/**
 * Checks whether the specified paths exist in the root path.
 *
 * Known issues:
 *
 * - Does not account for VS Code workspaces with multiple root folders (where the mentioned
 *   filePath could be under any of the roots).
 *
 * - Resolves all paths relative from the root. For example, a path "a/b.txt" would be marked as
 *   nonexistent if the root contained a path "x/a/b.txt" (and no "a/b.txt").
 *
 * @param rootPath - The path of the directory to be searched.
 * @param filePaths - The file paths to search for.
 * @returns An object that maps each file path to a boolean indicating whether the file was found.
 */
export async function fastFilesExist(rootPath: string, filePaths: string[]): Promise<{ [filePath: string]: boolean }> {
    const start = Date.now()
    const rootUri = vscode.Uri.file(rootPath)
    const results: { [filePath: string]: boolean } = {}
    await Promise.all(
        filePaths.map(async filePath => {
            const uri = vscode.Uri.joinPath(rootUri, filePath)
            try {
                await vscode.workspace.fs.stat(uri)
                results[filePath] = true
            } catch {
                // Treat all errors as effectively "file not found"
                results[filePath] = false
            }
        })
    )
    console.log(`file paths exist: ${Date.now() - start}ms (for ${filePaths.length} paths)`)
    return results
}
