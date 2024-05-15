import path from 'node:path'
import { vi } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import dedent from 'dedent'

interface MockFsCallsParams {
    filePath: string
    gitConfig: string
    gitRepoPath: string
    gitSubmodule?: {
        path: string
        gitFile: string
        gitConfig: string
    }
}

function deWindowsifyPath(path: string): string {
    return path.replaceAll('\\', '/')
}

export function mockFsCalls(params: MockFsCallsParams) {
    const { gitConfig, gitRepoPath, filePath, gitSubmodule } = params

    const files = {
        [filePath]: '',
        [`${gitRepoPath}/.git/config`]: gitConfig,
    }

    if (gitSubmodule) {
        const submoduleConfigPath = deWindowsifyPath(
            path.join(gitSubmodule.path, gitSubmodule.gitFile.trim().replace('gitdir: ', ''))
        )

        files[`${gitSubmodule.path}/.git`] = gitSubmodule.gitFile
        files[`${submoduleConfigPath}/config`] = gitSubmodule.gitConfig
    }

    const statMock = vi.spyOn(vscode.workspace.fs, 'stat').mockImplementation(async uri => {
        const fsPath = deWindowsifyPath(uri.fsPath)

        if (fsPath in files) {
            return { type: vscode.FileType.File } as vscode.FileStat
        }

        if (fsPath === `${gitRepoPath}/.git`) {
            return { type: vscode.FileType.Directory } as vscode.FileStat
        }

        throw new vscode.FileSystemError(uri)
    })

    const readFileMock = vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async uri => {
        const fsPath = deWindowsifyPath(uri.fsPath)

        if (fsPath in files) {
            return new TextEncoder().encode(dedent(files[fsPath]))
        }

        throw new vscode.FileSystemError(uri)
    })

    return { statMock, readFileMock, fileUri: URI.file(filePath) }
}
