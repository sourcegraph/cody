import { URI } from 'vscode-uri'

import { isWindows, setDisplayPathEnvInfo } from '@sourcegraph/cody-shared'

/** Runs in the VS Code webview. */
export function updateDisplayPathEnvInfoForWebview(workspaceFolderUris: string[]): void {
    setDisplayPathEnvInfo({
        isWindows: isWindows(),
        workspaceFolders: workspaceFolderUris.map(uri => URI.parse(uri)),
    })
}
