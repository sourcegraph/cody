import * as assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'node:path'

suite('Multi-root Workspace', () => {
    test('was correctly loaded', async () => {
        const workspaceFolderNames = vscode.workspace.workspaceFolders?.map(wf =>
            path.basename(wf.uri.fsPath)
        )
        assert.deepStrictEqual(workspaceFolderNames, ['workspace', 'workspace2'])
    })
})
