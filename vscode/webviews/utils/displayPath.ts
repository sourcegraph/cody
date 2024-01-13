import { URI } from 'vscode-uri'

import { basename, setDisplayPathFn } from '@sourcegraph/cody-shared'

let workspaceFolders: URI[] = []

export function updateWorkspaceFolderUris(workspaceFolderUris: string[]): void {
    workspaceFolders = workspaceFolderUris.map(uri => URI.parse(uri))
}

setDisplayPathFn(displayPathForWebviews)

export function displayPathForWebviews(location: URI | string): string {
    const uri = typeof location === 'string' ? URI.parse(location) : URI.from(location)
    // If the URI paths starts with "/c:/" (where C is any letter), it's a Windows
    // file URI.
    const isWindows = !!uri.path.match(/^\/\w:\//)
    const pathSeparator = isWindows ? '\\' : '/'

    // Mimic the behavior of vscode.workspace.asRelativePath.
    const includeWorkspaceFolder = workspaceFolders.length >= 2
    for (const folder of workspaceFolders) {
        const workspaceFolderName = basename(folder.path)
        if (uriHasPrefix(uri, folder, isWindows)) {
            const workspaceFolderPrefix = includeWorkspaceFolder ? workspaceFolderName + pathSeparator : ''
            return workspaceFolderPrefix + uri.path.slice(folder.path.length + 1).replaceAll('/', pathSeparator)
        }
    }
    // Absolute paths
    if (uri.scheme === 'file') {
        // Remove the leading slash on Windows
        return isWindows ? uri.path.slice(1).replaceAll('/', pathSeparator) : uri.path
    }
    return uri.toString()
}

export function uriHasPrefix(uri: URI, prefix: URI, isWindows: boolean): boolean {
    // On Windows, it's common to have drive letter casing mismatches (VS Code's APIs tend to normalize
    // to lowercase, but many other tools use uppercase and we don't know where the context file came
    // from).
    const uriPath =
        isWindows && uri.scheme === 'file' ? uri.path.slice(0, 2).toUpperCase() + uri.path.slice(2) : uri.path
    const prefixPath =
        isWindows && prefix.scheme === 'file'
            ? prefix.path.slice(0, 2).toUpperCase() + prefix.path.slice(2)
            : prefix.path
    return (
        uri.scheme === prefix.scheme &&
        (uri.authority || '') === (prefix.authority || '') && // different URI impls treat empty different
        (uriPath === prefixPath ||
            uriPath.startsWith(prefixPath.endsWith('/') ? prefixPath : prefixPath + '/') ||
            (prefixPath.endsWith('/') && uriPath === prefixPath.slice(0, -1)))
    )
}
