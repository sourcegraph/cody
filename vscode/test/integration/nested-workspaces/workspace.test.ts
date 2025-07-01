import * as assert from 'node:assert'
import * as path from 'node:path'
import * as vscode from 'vscode'
import type { ExtensionApi } from '../../../src/extension-api'

suite('Nested Workspaces', () => {
    test('was correctly loaded with nested workspace folders', async () => {
        const workspaceFolderNames = vscode.workspace.workspaceFolders?.map(wf =>
            path.basename(wf.uri.fsPath)
        )
        assert.deepStrictEqual(workspaceFolderNames, ['workspace', 'workspace2', 'subproject'])
        
        const api = vscode.extensions.getExtension<ExtensionApi>('sourcegraph.cody-ai')
        assert.ok(api, 'extension not found')
    })

    test('workspace2 contains subproject as subdirectory', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders!
        assert.strictEqual(workspaceFolders.length, 3)

        const workspace2 = workspaceFolders.find(wf => path.basename(wf.uri.fsPath) === 'workspace2')
        const subproject = workspaceFolders.find(wf => path.basename(wf.uri.fsPath) === 'subproject')

        assert.ok(workspace2, 'workspace2 should exist')
        assert.ok(subproject, 'subproject should exist')

        // Verify that subproject is indeed a subdirectory of workspace2
        const subprojectPath = subproject.uri.fsPath
        const workspace2Path = workspace2.uri.fsPath
        assert.ok(subprojectPath.startsWith(workspace2Path), 'subproject should be within workspace2')
    })
})
