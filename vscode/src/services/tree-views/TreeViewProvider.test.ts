import { describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import {
    DOTCOM_URL,
    type GraphQLAPIClientConfig,
    featureFlagProvider,
    graphqlClient,
    isDotCom,
} from '@sourcegraph/cody-shared'

import { newAuthStatus } from '../../chat/utils'
import { vsCodeMocks } from '../../testutils/mocks'

import { TreeViewProvider } from './TreeViewProvider'

vi.mock('vscode', () => ({
    ...vsCodeMocks,
    env: {},
}))

describe('TreeViewProvider', () => {
    graphqlClient.setConfig({} as unknown as GraphQLAPIClientConfig)
    vi.spyOn(featureFlagProvider.instance!, 'getFromCache').mockReturnValue(false)

    let tree: TreeViewProvider

    /**
     * Waits for the tree to fire its onDidChangeTreeData
     */
    async function waitForTreeUpdate() {
        let sub: vscode.Disposable
        return new Promise<void>(resolve => {
            sub = tree.onDidChangeTreeData(() => {
                sub.dispose()
                resolve()
            })
        })
    }

    /**
     * Refreshes the tree with the new auth flags and waits for the update.
     */
    async function updateTree({
        upgradeAvailable,
        endpoint,
    }: {
        upgradeAvailable: boolean
        endpoint: URL
    }): Promise<void> {
        const nextUpdate = waitForTreeUpdate()
        tree.setAuthStatus(
            newAuthStatus({
                endpoint: endpoint.toString(),
                isDotCom: isDotCom(endpoint.toString()),
                authenticated: true,
                hasVerifiedEmail: true,
                siteHasCodyEnabled: true,
                userCanUpgrade: upgradeAvailable,
                siteVersion: '',
                username: 'someuser',
                primaryEmail: 'me@domain.test',
                displayName: 'Test Name',
                avatarURL: 'https://domain.test/avatar.png',
            })
        )
        return nextUpdate
    }

    async function findTreeItem(label: string) {
        const items = await tree.getChildren()
        return items.find(item => (item.resourceUri as any)?.label === label)
    }

    describe('Cody Pro Upgrade', () => {
        it('is shown when user can upgrade', async () => {
            tree = new TreeViewProvider('support')
            await updateTree({ upgradeAvailable: true, endpoint: DOTCOM_URL })
            expect(await findTreeItem('Upgrade')).not.toBeUndefined()
            expect(await findTreeItem('Usage')).not.toBeUndefined()
        })

        it('is not shown when user cannot upgrade', async () => {
            tree = new TreeViewProvider('support')
            await updateTree({ upgradeAvailable: false, endpoint: DOTCOM_URL })
            expect(await findTreeItem('Upgrade')).toBeUndefined()
            expect(await findTreeItem('Usage')).toBeUndefined()
        })

        it('is not shown when not dotCom regardless of GA or upgrade flags', async () => {
            tree = new TreeViewProvider('support')
            await updateTree({ upgradeAvailable: true, endpoint: new URL('https://example.org') })
            expect(await findTreeItem('Upgrade')).toBeUndefined()
            expect(await findTreeItem('Usage')).toBeUndefined()
        })
    })

    describe('Account link', () => {
        it('is shown when user is pro', async () => {
            tree = new TreeViewProvider('support')
            await updateTree({ upgradeAvailable: false, endpoint: DOTCOM_URL })
            const accountTreeItem = await findTreeItem('Account')
            expect(accountTreeItem).not.toBeUndefined()
        })
        it('is shown when user is Enterprise', async () => {
            tree = new TreeViewProvider('support')
            await updateTree({ upgradeAvailable: true, endpoint: new URL('https://example.org') })
            expect(await findTreeItem('Account')).not.toBeUndefined()
        })
    })
})
