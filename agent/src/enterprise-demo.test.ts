import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import type { Requests } from './protocol-alias'

const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))

describe('Enterprise', () => {
    const demoEnterpriseClient = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'enterpriseClient',
        credentials: TESTING_CREDENTIALS.enterprise,
        logEventMode: 'connected-instance-only',
    })
    // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
    beforeAll(async () => {
        const serverInfo = await demoEnterpriseClient.initialize()

        expect(serverInfo.authStatus?.isLoggedIn).toBeTruthy()
        expect(serverInfo.authStatus?.username).toStrictEqual('codytesting')
    }, 10_000)

    // Skip because it consistently fails with:
    // unsupported chat model "anthropic/claude-3-opus-20240229" (default "anthropic::2023-06-01::claude-3-opus"
    // Linear issue: https://linear.app/sourcegraph/issue/PRIV-3329/chat-investigate-why-we-have-a-failing-agent-test-when-pointed-at
    it.skip('chat/submitMessage', async () => {
        const lastMessage = await demoEnterpriseClient.sendSingleMessageToNewChat('Reply with "Yes"')
        expect(lastMessage?.text?.trim()).toStrictEqual('Yes')
    }, 20_000)

    // Skip because it consistently fails with:
    // Error: Test timed out in 20000ms.
    it.skip('commands/document (enterprise client)', async () => {
        const uri = workspace.file('src', 'example.test.ts')
        const obtained = await demoEnterpriseClient.documentCode(uri)
        expect(obtained).toMatchInlineSnapshot(
            `
              "import { expect } from 'vitest'
              import { it } from 'vitest'
              import { describe } from 'vitest'

              describe('test block', () => {
                  it('does 1', () => {
                      expect(true).toBe(true)
                  })

                  it('does 2', () => {
                      expect(true).toBe(true)
                  })

                  it('does something else', () => {
                      // This line will error due to incorrect usage of \`performance.now\`
                      // Record the start time of the test using the Performance API
                      const startTime = performance.now(/* CURSOR */)
                  })
              })
              "
            `
        )
    }, 20_000)

    it('remoteRepo/list', async () => {
        // List a repo without a query
        let repos: Requests['remoteRepo/list'][1]
        do {
            repos = await demoEnterpriseClient.request('remoteRepo/list', {
                query: undefined,
                first: 10,
            })
        } while (repos.state.state === 'fetching')
        expect(repos.repos).toHaveLength(10)

        // Make a paginated query.
        const secondLastRepo = repos.repos.at(-2)
        const moreRepos = await demoEnterpriseClient.request('remoteRepo/list', {
            query: undefined,
            first: 2,
            afterId: secondLastRepo?.id,
        })
        expect(moreRepos.repos[0].id).toBe(repos.repos.at(-1)?.id)

        // Make a query.
        const filteredRepos = await demoEnterpriseClient.request('remoteRepo/list', {
            query: 'sourceco',
            first: 1000,
        })
        expect(
            filteredRepos.repos.find(repo => repo.name === 'github.com/sourcegraph/cody')
        ).toBeDefined()
    })

    it('remoteRepo/has', async () => {
        // Query a repo that does exist.
        const codyRepoExists = await demoEnterpriseClient.request('remoteRepo/has', {
            repoName: 'github.com/sourcegraph/cody',
        })
        expect(codyRepoExists.result).toBe(true)

        // Query a repo that does not exist.
        const codyForDos = await demoEnterpriseClient.request('remoteRepo/has', {
            repoName: 'github.com/sourcegraph/cody-edlin',
        })
        expect(codyForDos.result).toBe(false)
    })

    afterAll(async () => {
        const { requests } = await demoEnterpriseClient.request('testing/networkRequests', null)
        const nonServerInstanceRequests = requests
            .filter(({ url }) => !url.startsWith(demoEnterpriseClient.serverEndpoint))
            .map(({ url }) => url)
        expect(JSON.stringify(nonServerInstanceRequests)).toStrictEqual('[]')
        await demoEnterpriseClient.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 30_000)
})
