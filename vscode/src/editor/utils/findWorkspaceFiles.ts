import * as vscode from 'vscode'

/**
 * Find all files in all workspace folders, respecting the user's `files.exclude`, `search.exclude`,
 * and other exclude settings. The intent is to match the files shown by VS Code's built-in `Go to
 * File...` command.
 */
export async function findWorkspaceFiles(): Promise<ReadonlyArray<vscode.Uri>> {
    const excludePatterns = await Promise.all(
        vscode.workspace.workspaceFolders?.flatMap(workspaceFolder => {
            return getExcludePattern(workspaceFolder)
        }) ?? []
    )

    return vscode.workspace.findFiles('**/*', `{${excludePatterns.join(',')}}`)
}

type IgnoreRecord = Record<string, boolean>

async function getExcludePattern(workspaceFolder: vscode.WorkspaceFolder | null): Promise<string[]> {
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
    return Object.keys(mergedExclude).filter(key => mergedExclude[key] === true)
}

export async function readIgnoreFile(uri: vscode.Uri): Promise<IgnoreRecord> {
    const ignore: IgnoreRecord = {}
    try {
        const data = await vscode.workspace.fs.readFile(uri)
        for (let line of Buffer.from(data).toString('utf-8').split('\n')) {
            if (line.startsWith('!')) {
                continue
            }

            // Strip comment and whitespace.
            line = line.replace(/\s*(#.*)?$/, '').trim()

            if (line === '') {
                continue
            }

            // Replace , with . that contain commas to avoid typos for entries such as
            // *,something
            if (line.includes(',')) {
                line = line.replace(',', '.')
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
