import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import type { ReplaceTextEdit } from '../../vscode/src/jsonrpc/agent-protocol'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { trimEndOfLine } from './trimEndOfLine'

describe.skip('Generate Unit Test', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'generate-unit-test'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'generate-unit-test',
        credentials: TESTING_CREDENTIALS.enterprise,
    })

    beforeAll(async () => {
        await workspace.beforeAll()
        await client.beforeAll()
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    // TODO(sqs): Skip due to flakiness on CI: https://github.com/sourcegraph/cody/actions/runs/9377140919/job/25818213028#step:7:1017.
    it.skip('editCommands/test', async () => {
        const uri = workspace.file('src', 'trickyLogic.ts')
        await client.openFile(uri)
        const taskId = await client.request('editTask/start', null)
        if (!taskId) {
            throw new Error('Task cannot be null or undefined')
        }
        await client.acceptLensWasShown(uri)
        const untitledDocuments = client.workspace
            .allUris()
            .filter(uri => vscode.Uri.parse(uri).scheme === 'untitled')
        expect(untitledDocuments).toHaveLength(2)
        const untitledDocument = untitledDocuments.find(d => d.endsWith('trickyLogic.test.ts'))
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
})
