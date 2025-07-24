import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { allClientCapabilitiesEnabled } from './allClientCapabilitiesEnabled'

describe(
    'Initializing the agent without credentials',
    {
        timeout: 5000,
    },
    async () => {
        const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'auth'))
        const client = TestClient.create({
            workspaceRootUri: workspace.rootUri,
            name: 'unauthed',
            credentials: TESTING_CREDENTIALS.s2Unauthed,
        })

        beforeAll(async () => {
            await workspace.beforeAll()
            await client.beforeAll(undefined, { expectAuthenticated: false })
        })

        afterAll(async () => {
            await workspace.afterAll()
            await client.afterAll()
        })

        it('starts up with no credentials', async () => {
            const authStatus = await client.request('extensionConfiguration/status', null)
            expect(authStatus?.authenticated).toBe(false)
            expect(authStatus?.endpoint).toBe(TESTING_CREDENTIALS.s2Unauthed.serverEndpoint)
        })

        it.skip('starts up with default endpoint and credentials if they are present in the secure store', async () => {
            const newClient = TestClient.create({
                workspaceRootUri: workspace.rootUri,
                name: 'unauthed-new',
                credentials: TESTING_CREDENTIALS.s2Unauthed,
                capabilities: {
                    ...allClientCapabilitiesEnabled,
                    secrets: 'client-managed',
                },
            })

            await newClient.secrets.store(
                TESTING_CREDENTIALS.s2.serverEndpoint,
                TESTING_CREDENTIALS.s2.token ?? 'invalid'
            )

            await newClient.beforeAll(
                { serverEndpoint: TESTING_CREDENTIALS.s2.serverEndpoint },
                { expectAuthenticated: true }
            )
            const authStatus = await newClient.request('extensionConfiguration/status', null)
            expect(authStatus?.authenticated).toBe(true)
            expect(authStatus?.endpoint).toBe(TESTING_CREDENTIALS.s2.serverEndpoint)
            await newClient.afterAll()
        })

        it('authenticates to same endpoint using valid credentials', async () => {
            const authStatus = await client.request('extensionConfiguration/change', {
                ...client.info.extensionConfiguration,
                accessToken: TESTING_CREDENTIALS.s2.token ?? TESTING_CREDENTIALS.s2.redactedToken,
                serverEndpoint: TESTING_CREDENTIALS.s2.serverEndpoint,
                customHeaders: {},
            })
            expect(authStatus?.authenticated).toBe(true)
            expect(authStatus?.endpoint).toBe(TESTING_CREDENTIALS.s2.serverEndpoint)
        })

        it('de-authenticates to same endpoint', async () => {
            const authStatus = await client.request('extensionConfiguration/change', {
                ...client.info.extensionConfiguration,
                accessToken: undefined,
                serverEndpoint: TESTING_CREDENTIALS.s2Unauthed.serverEndpoint,
                customHeaders: {},
            })
            expect(authStatus?.authenticated).toBe(false)
            expect(authStatus?.endpoint).toBe(TESTING_CREDENTIALS.s2Unauthed.serverEndpoint)
        })

        it('authenticates to a different endpoint using valid credentials', async () => {
            const authStatus = await client.request('extensionConfiguration/change', {
                ...client.info.extensionConfiguration,
                accessToken: TESTING_CREDENTIALS.s2.token ?? TESTING_CREDENTIALS.s2.redactedToken,
                serverEndpoint: TESTING_CREDENTIALS.s2.serverEndpoint,
                customHeaders: {},
            })
            expect(authStatus?.authenticated).toBe(true)
            expect(authStatus?.endpoint).toBe(TESTING_CREDENTIALS.s2.serverEndpoint)
        })
    }
)
