import * as assert from 'node:assert'
import * as path from 'node:path'
import * as vscode from 'vscode'
import type { ExtensionApi } from '../../../src/extension-api'

suite('Multi-root Workspace', () => {
    test('was correctly loaded', async () => {
        // NOTE: Cody does not support @-mentioning workspace folders in VS Code multi-root
        // workspaces beyond the first workspace folder. This test just ensures that Cody does not
        // crash.
        const workspaceFolderNames = vscode.workspace.workspaceFolders?.map(wf =>
            path.basename(wf.uri.fsPath)
        )
        assert.deepStrictEqual(workspaceFolderNames, ['workspace', 'workspace2'])
        const api = vscode.extensions.getExtension<ExtensionApi>('sourcegraph.cody-ai')
        assert.ok(api, 'extension not found')
    })
})
