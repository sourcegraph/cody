import * as vscode from 'vscode'

import { CODY_IGNORE_FILENAME, setCodyIgnoreList } from '@sourcegraph/cody-shared/src/chat/context-filter'

export async function createCodyIgnoreList(): Promise<void> {
    // Get the current cody ignore list
    const update = async (): Promise<void> => {
        const currentIgnoreList = await getCodyIgnoreFile()
        if (!currentIgnoreList) {
            return
        }
        // Set the updated cody ignore list
        setCodyIgnoreList(currentIgnoreList)
    }

    // Update ignore list on editor change
    vscode.workspace.onDidChangeTextDocument(async e => {
        if (e.document.uri.scheme !== 'file') {
            return
        }
        if (e.document.uri.fsPath.endsWith(CODY_IGNORE_FILENAME)) {
            await update()
        }
    })

    await update()
}

async function getCodyIgnoreFile(): Promise<string | undefined> {
    // Get git ignore file context using the vs code api
    // First, get the gitignore file from the workspace root directory
    const codyIgnoreFile = await vscode.workspace.findFiles(CODY_IGNORE_FILENAME)
    // If the gitignore file exists, get the content of the file
    if (!codyIgnoreFile.length) {
        return undefined
    }
    const bytes = await vscode.workspace.fs.readFile(codyIgnoreFile[0])
    const decoded = new TextDecoder('utf-8').decode(bytes)
    return decoded
}

export async function updateCodyIgnoreList(): Promise<void> {
    // Get the current cody ignore list
    const update = async (): Promise<void> => {
        const currentIgnoreList = await getCodyIgnoreFile()
        if (!currentIgnoreList) {
            return
        }
        // Set the updated cody ignore list
        setCodyIgnoreList(currentIgnoreList)
    }

    await update()
}

// export async function getCodyIgnoreFileWatcher(): Promise<vscode.FileSystemWatcher> {
//     const rootDirUri = vscode.workspace.workspaceFolders?.[0].uri

//     let watchFilePath = ''
//     let codyIgnoredWatcher: vscode.FileSystemWatcher | undefined

//     if (rootDirUri) {
//         watchFilePath = vscode.Uri.joinPath(rootDirUri, CODY_IGNORE_FILENAME).fsPath
//     }

//     // listen to workspace change
//     vscode.workspace.onDidChangeWorkspaceFolders(() => {
//         if (vscode.workspace.workspaceFolders?.length) {
//             const watchFileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, CODY_IGNORE_FILENAME)
//             create(watchFileUri)
//         }
//     })

//     const create = (filePath: string): vscode.FileSystemWatcher => {
//         // Use the file as the first arg to RelativePattern because a file watcher will be set up on the
//         // first arg given. If this is a directory with many files, such as the user's home directory,
//         // it will cause a very large number of watchers to be created, which will exhaust the system.
//         // This occurs even if the second arg is a relative file path with no wildcards.
//         const watchPattern = new vscode.RelativePattern(filePath, '*')
//         const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
//         watcher.onDidChange(async () => {
//             await updateCodyIgnoreList()
//         })
//         watcher.onDidChange(async () => {
//             await updateCodyIgnoreList()
//         })
//         watcher.onDidDelete(async () => {
//             await updateCodyIgnoreList()
//         })
//         codyIgnoredWatcher = watcher
//         return watcher
//     }

//     await updateCodyIgnoreList()

//     return create(watchFilePath)
// }
