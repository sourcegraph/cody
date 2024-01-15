import { URI } from 'vscode-uri'

import { isWindows } from '@sourcegraph/cody-shared'

import { setDisplayPathEnvInfo } from '../../../lib/shared/src/editor/displayPath'

/** Runs in the VS Code webview. */
export function updateDisplayPathEnvInfoForWebview(workspaceFolderUris: string[]): void {
    setDisplayPathEnvInfo({
        isWindows: isWindows(),
        workspaceFolders: workspaceFolderUris.map(uri => URI.parse(uri)),
    })
}
