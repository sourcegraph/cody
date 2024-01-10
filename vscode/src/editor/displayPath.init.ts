import path from 'path'

import * as vscode from 'vscode'

import { setDisplayPathFn } from '@sourcegraph/cody-shared'

setDisplayPathFn(displayPathForExtension)

function displayPathForExtension(location: vscode.Uri | string): string {
    // vscode.workspace.asRelativePath returns forward slashes on Windows, but we want to render an
    // OS-native path (with backslashes on Windows).
    const pathWithForwardSlashes = vscode.workspace.asRelativePath(location)
    return pathWithForwardSlashes.replaceAll(path.posix.sep, path.sep)
}
