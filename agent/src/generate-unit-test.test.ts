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
