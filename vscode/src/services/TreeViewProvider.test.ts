import { describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { newAuthStatus } from '../chat/utils'
import { decGaMockFeatureFlagProvider, emptyMockFeatureFlagProvider, vsCodeMocks } from '../testutils/mocks'

import { TreeViewProvider } from './TreeViewProvider'

vi.mock('vscode', () => ({
    ...vsCodeMocks,
    env: {},
}))

describe('TreeViewProvider', () => {
    const siteVersion = ''
    const isDotComOrApp = true // Always true here because these tests only use userCanUpgrade (which should be set accordingly)
    const verifiedEmail = true
    const codyEnabled = true
    const validUser = true
    const endpoint = 'https://example.com'

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
    async function updateTree({ upgradeAvailable }: { upgradeAvailable: boolean }): Promise<void> {
        // TODO(dantup): This can be much simplified when we don't need to check async
        //  feature flags inside the refresh.
        await waitForTreeUpdate()
        const nextUpdate = waitForTreeUpdate()
        tree.syncAuthStatus(
            newAuthStatus(endpoint, isDotComOrApp, validUser, verifiedEmail, codyEnabled, upgradeAvailable, siteVersion)
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
            await updateTree({ upgradeAvailable: true })
            expect(findTreeItem('Upgrade')).not.toBeUndefined()
        })

        it('is not shown when user cannot upgrade', async () => {
            tree = new TreeViewProvider('support', decGaMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: false })
            expect(findTreeItem('Upgrade')).toBeUndefined()
        })

        it('is not shown when not GA', async () => {
            tree = new TreeViewProvider('support', emptyMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: true })
            expect(findTreeItem('Upgrade')).toBeUndefined()
        })
    })

    describe('Usage', () => {
        it('is shown when GA', async () => {
            tree = new TreeViewProvider('support', decGaMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: true })
            expect(findTreeItem('Usage')).not.toBeUndefined()
        })

        it('is not shown when not GA', async () => {
            tree = new TreeViewProvider('support', emptyMockFeatureFlagProvider)
            await updateTree({ upgradeAvailable: true })
            expect(findTreeItem('Usage')).toBeUndefined()
        })
    })
})
