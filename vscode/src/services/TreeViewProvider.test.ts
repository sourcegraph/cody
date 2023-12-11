import { describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { DOTCOM_URL, isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { newAuthStatus } from '../chat/utils'
import { decGaMockFeatureFlagProvider, emptyMockFeatureFlagProvider, vsCodeMocks } from '../testutils/mocks'

import { TreeViewProvider } from './TreeViewProvider'

vi.mock('vscode', () => ({
    ...vsCodeMocks,
    env: {},
}))

describe('TreeViewProvider', () => {
    const siteVersion = ''
    const verifiedEmail = true
    const codyEnabled = true
    const validUser = true
    const primaryEmail = 'me@domain.test'
    const displayName = 'Test Name'
    const avatarURL = 'https://domain.test/avatar.png'

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
        tree.syncAuthStatus(
            newAuthStatus(
                endpoint.toString(),
                isDotCom(endpoint.toString()),
                validUser,
                verifiedEmail,
                codyEnabled,
                upgradeAvailable,
                siteVersion,
                avatarURL,
                primaryEmail,
                displayName
            )
        )
        return nextUpdate
    }

    function findTreeItem(label: string) {
        const items = tree.getChildren()
        return items.find(item => (item.resourceUri as any)?.label === label)
    }

    describe('Cody Pro Upgrade', () => {
        it('is shown when GA + user can upgrade', async () => {
            tree = new TreeViewProvider('support', decGaMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: true, endpoint: DOTCOM_URL })
            expect(findTreeItem('Upgrade')).not.toBeUndefined()
        })

        it('is not shown when user cannot upgrade', async () => {
            tree = new TreeViewProvider('support', decGaMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: false, endpoint: DOTCOM_URL })
            expect(findTreeItem('Upgrade')).toBeUndefined()
        })

        it('is not shown when not GA', async () => {
            tree = new TreeViewProvider('support', emptyMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: true, endpoint: DOTCOM_URL })
            expect(findTreeItem('Upgrade')).toBeUndefined()
        })

        it('is not shown when not dotCom regardless of GA or upgrade flags', async () => {
            tree = new TreeViewProvider('support', decGaMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: true, endpoint: new URL('https://example.org') })
            expect(findTreeItem('Upgrade')).toBeUndefined()
        })
    })

    describe('Usage', () => {
        it('is shown when GA', async () => {
            tree = new TreeViewProvider('support', decGaMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: true, endpoint: DOTCOM_URL })
            expect(findTreeItem('Usage')).not.toBeUndefined()
        })

        it('is not shown when not GA', async () => {
            tree = new TreeViewProvider('support', emptyMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: true, endpoint: DOTCOM_URL })
            expect(findTreeItem('Usage')).toBeUndefined()
        })

        it('is not shown when not dotCom regardless of GA or upgrade flags', async () => {
            tree = new TreeViewProvider('support', decGaMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: true, endpoint: new URL('https://example.org') })
            expect(findTreeItem('Usage')).toBeUndefined()
        })
    })
})
