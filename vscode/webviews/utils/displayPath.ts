import { URI } from 'vscode-uri'

import { basename, setDisplayPathFn } from '@sourcegraph/cody-shared'

let workspaceFolders: URI[] = []

export function updateWorkspaceFolderUris(workspaceFolderUris: string[]): void {
    workspaceFolders = workspaceFolderUris.map(uri => URI.parse(uri))
}

const PATH_SEP = '/' // TODO(sqs): should be backslash for windows

setDisplayPathFn(displayPathForWebviews)

export function displayPathForWebviews(location: URI | string): string {
    const uri = typeof location === 'string' ? URI.parse(location) : URI.from(location)

    // Mimic the behavior of vscode.workspace.asRelativePath.
    const includeWorkspaceFolder = workspaceFolders.length >= 2
    for (const folder of workspaceFolders) {
        const workspaceFolderPrefix = includeWorkspaceFolder ? basename(folder.path) + PATH_SEP : ''
        if (uriHasPrefix(uri, folder)) {
            return workspaceFolderPrefix + uri.path.slice(folder.path.length + 1)
        }
    }
    return uri.scheme === 'file' ? uri.path : uri.toString()
}

export function uriHasPrefix(uri: URI, prefix: URI): boolean {
    return (
        uri.scheme === prefix.scheme &&
        (uri.authority || '') === (prefix.authority || '') && // different URI impls treat empty different
        (uri.path === prefix.path ||
            uri.path.startsWith(prefix.path.endsWith('/') ? prefix.path : prefix.path + '/') ||
            (prefix.path.endsWith('/') && uri.path === prefix.path.slice(0, -1)))
    )
}
