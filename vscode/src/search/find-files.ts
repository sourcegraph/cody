import * as vscode from 'vscode'
import path from 'path'
import { matchesGlobPatterns } from './matchesGlobPatterns'

/**
 * An alternative to vscode.workspace.findFiles() that skips symlinks.
 * */
export async function findFiles(
    include: vscode.GlobPattern,
    exclude?: vscode.GlobPattern | null,
    maxResults?: number,
    token?: vscode.CancellationToken
): Promise<FindFilesResults> {
    const workspaceFolders = vscode.workspace.workspaceFolders?.slice() ?? []
    const workspaceFs = vscode.workspace.fs

    let searchFolders: vscode.WorkspaceFolder[]
    let searchPattern: string

    if (typeof include === 'string') {
        searchFolders = workspaceFolders
        searchPattern = include
    } else {
        const matchingWorkspaceFolder = workspaceFolders.find(
            wf => wf.uri.toString() === include.baseUri.toString()
        )
        if (!matchingWorkspaceFolder) {
            throw new TypeError(
                `workspaces.findFiles: RelativePattern must use a known WorkspaceFolder\n  Got: ${
                    include.baseUri
                }\n  Known:\n${workspaceFolders.map(wf => `  - ${wf.uri.toString()}\n`).join()}`
            )
        }
        searchFolders = [matchingWorkspaceFolder]
        searchPattern = include.pattern
    }

    if (exclude !== undefined && typeof exclude !== 'string') {
        throw new TypeError('workspaces.findFiles: exclude must be a string')
    }

    const matches: vscode.Uri[] = []
    const skipped: vscode.Uri[] = []
    const loop = async (workspaceRoot: vscode.Uri, dir: vscode.Uri): Promise<void> => {
        if (token?.isCancellationRequested) {
            return
        }
        const files = await workspaceFs.readDirectory(dir)
        for (const [name, fileType] of files) {
            const uri = vscode.Uri.file(path.join(dir.fsPath, name))
            const relativePath = path.relative(workspaceRoot.fsPath, uri.fsPath)

            // Skip symlinks.
            if (fileType.valueOf() === vscode.FileType.SymbolicLink.valueOf()) {
                skipped.push(uri)
                continue
            }

            if (fileType.valueOf() === vscode.FileType.Directory.valueOf()) {
                if (!matchesGlobPatterns([], exclude ? [exclude] : [], relativePath)) {
                    continue
                }
                await loop(workspaceRoot, uri)
            } else if (fileType.valueOf() === vscode.FileType.File.valueOf()) {
                if (
                    !matchesGlobPatterns(
                        searchPattern ? [searchPattern] : [],
                        exclude ? [exclude] : [],
                        relativePath
                    )
                ) {
                    continue
                }

                matches.push(uri)
                if (maxResults !== undefined && matches.length >= maxResults) {
                    return
                }
            }
        }
    }

    await Promise.all(
        searchFolders.map(async folder => {
            try {
                const stat = await workspaceFs.stat(folder.uri)
                if (stat.type.valueOf() === vscode.FileType.Directory.valueOf()) {
                    await loop(folder.uri, folder.uri)
                }
            } catch (error) {
                console.error(
                    `workspace.workspace.findFiles: failed to stat workspace folder ${folder.uri}. Error ${error}`,
                    new Error().stack
                )
            }
        })
    )
    return { matches, skipped }
}

export interface FindFilesResults {
    /**
     * Matches for the search.
     */
    matches: vscode.Uri[]

    /**
     * Items that were skipped during the search (for example symlinks).
     */
    skipped: vscode.Uri[]
}
