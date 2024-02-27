import * as assert from 'assert'
import * as path from 'node:path'
import * as vscode from 'vscode'

suite('Multi-root Workspace', () => {
    test('was correctly loaded', async () => {
        const workspaceFolderNames = vscode.workspace.workspaceFolders?.map(wf =>
            path.basename(wf.uri.fsPath)
        )
        assert.deepStrictEqual(workspaceFolderNames, ['workspace', 'workspace2'])
    })
})
