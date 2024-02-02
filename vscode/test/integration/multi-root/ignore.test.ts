import assert from 'assert'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { getExtensionAPI } from '../helpers'

suite('Ignores in multi-root workspace', () => {
    const workspace1Path = vscode.workspace.workspaceFolders![0].uri.fsPath
    const workspace2Path = vscode.workspace.workspaceFolders![1].uri.fsPath

    async function checkIgnore(fullPath: string, expectIgnored: boolean) {
        const ignoreHelper = await (await getExtensionAPI().activate()).testing!.ignoreHelper.get()

        await new Promise(resolve => setTimeout(resolve, 1000))

        fullPath = path.normalize(fullPath)
        const fileUri = URI.file(fullPath)

        // Verify the file exists to ensure the parts are correct.
        assert.ok(fs.existsSync(fullPath))

        // Verify ignore status.
        assert.equal(
            ignoreHelper.isIgnored(fileUri),
            expectIgnored,
            `Wrong ignore status for ${fileUri}`
        )
    }

    test('ignores ws1 files in workspace1', () =>
        checkIgnore(`${workspace1Path}/ignoreTests/ignoreTest.ws1`, true))

    test('does not ignore ws2 files in workspace1', () =>
        checkIgnore(`${workspace1Path}/ignoreTests/ignoreTest.ws2`, false))

    test('does not ignore ws1 files in workspace2', () =>
        checkIgnore(`${workspace2Path}/ignoreTests/ignoreTest.ws1`, false))

    test('ignores ws2 files in workspace2', () =>
        checkIgnore(`${workspace2Path}/ignoreTests/ignoreTest.ws2`, true))
})
