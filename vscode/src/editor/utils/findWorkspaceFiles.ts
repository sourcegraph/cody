import * as vscode from 'vscode'

/**
 * Find all files in all workspace folders, respecting the user's `files.exclude`, `search.exclude`,
 * and other exclude settings. The intent is to match the files shown by VS Code's built-in `Go to
 * File...` command.
 */
export async function findWorkspaceFiles(
    cancellationToken?: vscode.CancellationToken
): Promise<ReadonlyArray<vscode.Uri>> {
    return (
        await Promise.all(
            (vscode.workspace.workspaceFolders ?? [null]).map(async workspaceFolder =>
                vscode.workspace.findFiles(
                    workspaceFolder ? new vscode.RelativePattern(workspaceFolder, '**') : '',
                    await getExcludePattern(workspaceFolder),
                    undefined,
                    cancellationToken
                )
            )
        )
    ).flat()
}

type IgnoreRecord = Record<string, boolean>

async function getExcludePattern(workspaceFolder: vscode.WorkspaceFolder | null): Promise<string> {
    const config = vscode.workspace.getConfiguration('', workspaceFolder)
    const filesExclude = config.get<IgnoreRecord>('files.exclude', {})
    const searchExclude = config.get<IgnoreRecord>('search.exclude', {})

    const useIgnoreFiles = config.get<boolean>('search.useIgnoreFiles')
    const gitignoreExclude =
        useIgnoreFiles && workspaceFolder
            ? await readIgnoreFile(vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore'))
            : {}
    const ignoreExclude =
        useIgnoreFiles && workspaceFolder
            ? await readIgnoreFile(vscode.Uri.joinPath(workspaceFolder.uri, '.ignore'))
            : {}

    const mergedExclude: IgnoreRecord = {
        ...filesExclude,
        ...searchExclude,
        ...gitignoreExclude,
        ...ignoreExclude,
    }
    const excludePatterns = Object.keys(mergedExclude).filter(key => mergedExclude[key] === true)
    return `{${excludePatterns.join(',')}}`
}

async function readIgnoreFile(uri: vscode.Uri): Promise<IgnoreRecord> {
    const ignore: IgnoreRecord = {}
    try {
        const data = await vscode.workspace.fs.readFile(uri)
        for (let line of Buffer.from(data).toString('utf-8').split('\n')) {
            if (line.startsWith('!')) {
                continue
            }

            // Strip comment and trailing whitespace.
            line = line.replace(/\s*(#.*)?$/, '')

            if (line === '') {
                continue
            }

            if (line.endsWith('/')) {
                line = line.slice(0, -1)
            }
            if (!line.startsWith('/') && !line.startsWith('**/')) {
                line = `**/${line}`
            }
            ignore[line] = true
        }
    } catch {}
    return ignore
}
