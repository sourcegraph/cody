import * as assert from 'assert'

import * as vscode from 'vscode'

import { fastFilesExist } from '../../src/chat/fastFileFinder'

import { afterIntegrationTest, beforeIntegrationTest } from './helpers'

suite('Local search', function () {
    this.beforeEach(() => beforeIntegrationTest())
    this.afterEach(() => afterIntegrationTest())

    test('fast file finder', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders
        assert.ok(workspaceFolders)
        assert.ok(workspaceFolders.length >= 1)

        const filesExistMap = await fastFilesExist(workspaceFolders[0].uri.fsPath, [
            'lib',
            'batches',
            'env',
            'var.go',
            'lib/batches',
            'batches/env',
            'lib/batches/env/var.go',
            'lib/batches/var.go',
            './lib/codeintel/tools/lsif-visualize/visualize.go',
        ])
        assert.deepStrictEqual(filesExistMap, {
            lib: true,
            batches: false,
            env: false,
            'var.go': false,
            'lib/batches': true,
            'batches/env': false,
            'lib/batches/env/var.go': true,
            'lib/batches/var.go': false,
            './lib/codeintel/tools/lsif-visualize/visualize.go': true,
        })
    })
})
