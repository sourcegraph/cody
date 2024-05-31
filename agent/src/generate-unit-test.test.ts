import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import type { ReplaceTextEdit } from '../../vscode/src/jsonrpc/agent-protocol'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { trimEndOfLine } from './trimEndOfLine'

describe('Generate Unit Test', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'generate-unit-test'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'generate-unit-test',
        credentials: TESTING_CREDENTIALS.dotcom,
    })

    beforeAll(async () => {
        await workspace.beforeAll()
        await client.beforeAll()
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    it('editCommands/test', async () => {
        const uri = workspace.file('src', 'trickyLogic.ts')
        await client.openFile(uri)
        const id = await client.request('editCommands/test', null)
        await client.taskHasReachedAppliedPhase(id)

        const untitledDocuments = client.workspace
            .allUris()
            .filter(uri => vscode.Uri.parse(uri).scheme === 'untitled')
        expect(untitledDocuments).toHaveLength(2)
        const untitledDocument = untitledDocuments.find(d => d.endsWith('trickyLogic.spec.ts'))
        expect(untitledDocument).toBeDefined()
        const testDocument = client.workspace.getDocument(vscode.Uri.parse(untitledDocument ?? ''))
        expect(trimEndOfLine(testDocument?.getText())).toMatchSnapshot()
        expect(client.textDocumentEditParams).toHaveLength(1)
        for (const editParam of client.textDocumentEditParams) {
            for (const edit of editParam.edits) {
                const range = (edit as ReplaceTextEdit).range
                expect(range.start.line).toBeGreaterThanOrEqual(0)
                expect(range.end.line).toBeGreaterThanOrEqual(0)
            }
        }
    }, 30_000)

    it('respects existing content by inserting on a blank line', async () => {
        const testUri = workspace.file('src', 'existing', 'body.spec.ts')
        // We use fs here so we don't open the file yet. This is so we can catch
        // caching issues
        const testBeforeContent = await fs.promises.readFile(testUri.fsPath, 'utf-8')

        const uri = workspace.file('src', 'existing', 'body.ts')
        await client.openFile(uri)
        const id = await client.request('editCommands/test', null)
        await client.taskHasReachedAppliedPhase(id)

        const testFile = client.workspace.getDocument(testUri)

        const testAfterContent = testFile?.getText()

        expect(testAfterContent?.startsWith(testBeforeContent)).toBeTruthy()
        expect(testAfterContent).not.toEqual(testBeforeContent)
    })

    it('handles content changes outside the editor', async () => {
        const testUri = workspace.file('src', 'existing', 'body.spec.ts')
        const testBeforeContent = await fs.promises.readFile(testUri.fsPath, 'utf-8')

        // we open and "close" the file to hopefully cache the content.
        // technically I would like to just close the editor but there does not
        // seem to be a function for that yet
        await client.openFile(testUri)
        // await client.workspace.reset()

        // after which we modify the file outside the editor. This could be like a `git checkout` command
        await fs.promises.writeFile(testUri.fsPath, 'blank content\n')

        // now we generate a test to see if the testfile content is stale
        const uri = workspace.file('src', 'existing', 'body.ts')

        // This call should not be neccesary:
        // await client.openFile(testUri)
        await client.openFile(uri)
        const id = await client.request('editCommands/test', null)
        await client.taskHasReachedAppliedPhase(id)

        const testFile = client.workspace.getDocument(testUri)

        const testAfterContent = testFile?.getText()

        // the test file should now no longer start with the original content
        // but with "blank content"
        expect(testAfterContent?.startsWith(testBeforeContent)).toBeFalsy()
    })
})
