import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

describe('Document Code', { timeout: 5000 }, () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'document-code'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'document-code',
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

    it('editCommands/document (basic function)', async () => {
        expect(await client.documentCode(workspace.file('src', 'sum.ts'))).toMatchSnapshot()
    })

    it('commands/document (Method as part of a class)', async () => {
        expect(await client.documentCode(workspace.file('src', 'TestClass.ts'))).toMatchSnapshot()

        const { requests } = await client.request('testing/networkRequests', null)
        expect(requests.find(r => r.body?.includes('const longSuffix'))).toBeTruthy()
        expect(requests.find(r => r.body?.includes('const longPrefix'))).toBeTruthy()
    })

    it('commands/document (Function within a property)', async () => {
        expect(await client.documentCode(workspace.file('src', 'TestLogger.ts'))).toMatchSnapshot()
    })

    it('commands/document (nested test case)', async () => {
        expect(await client.documentCode(workspace.file('src', 'example.test.ts'))).toMatchSnapshot()
    })

    it('commands/document (Kotlin class name)', async () => {
        expect(await client.documentCode(workspace.file('src', 'Hello.kt'))).toMatchSnapshot()
    })
})
