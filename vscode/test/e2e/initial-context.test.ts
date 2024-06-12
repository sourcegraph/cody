import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'
import {
    chatInputMentions,
    clickEditorTab,
    createEmptyChatPanel,
    openFileInEditorTab,
    selectLineRangeInEditorTab,
    sidebarSignin,
} from './common'
import { type DotcomUrlOverride, mockEnterpriseRepoMapping, testWithGitRemote } from './helpers'

testWithGitRemote.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })(
    'initial context - self-serve repo',
    async ({ page, sidebar }) => {
        await sidebarSignin(page, sidebar)
        const [, lastChatInput] = await createEmptyChatPanel(page)

        // The current repository should be initially present in the chat input.
        await expect(chatInputMentions(lastChatInput)).toHaveText(['@myrepo'])
    }
)

testWithGitRemote('initial context - enterprise repo', async ({ page, sidebar, server }) => {
    mockEnterpriseRepoMapping(server, 'host.example/user/myrepo')

    await sidebarSignin(page, sidebar)
    const [, lastChatInput] = await createEmptyChatPanel(page)

    // The current repository should be initially present in the chat input.
    await expect(chatInputMentions(lastChatInput)).toHaveText(['@host.example/user/myrepo'])
})

testWithGitRemote('initial context - file', async ({ page, sidebar, server }) => {
    mockEnterpriseRepoMapping(server, 'host.example/user/myrepo')

    await sidebarSignin(page, sidebar)

    await openFileInEditorTab(page, 'main.c')

    await page.getByRole('tab', { name: /Cody*/ }).click()

    const [, lastChatInput] = await createEmptyChatPanel(page)

    await expect(chatInputMentions(lastChatInput)).toHaveText(['@host.example/user/myrepo', '@main.c'])

    await selectLineRangeInEditorTab(page, 2, 4)
    await expect(chatInputMentions(lastChatInput)).toHaveText([
        '@host.example/user/myrepo',
        '@main.c:2-4',
    ])

    await selectLineRangeInEditorTab(page, 1, 3)
    await expect(chatInputMentions(lastChatInput)).toHaveText([
        '@host.example/user/myrepo',
        '@main.c:1-3',
    ])

    await openFileInEditorTab(page, 'README.md')
    await expect(chatInputMentions(lastChatInput)).toHaveText([
        '@host.example/user/myrepo',
        '@README.md',
    ])

    await clickEditorTab(page, 'main.c')
    await expect(chatInputMentions(lastChatInput)).toHaveText([
        '@host.example/user/myrepo',
        '@main.c:1-3',
    ])

    // After typing into the input, it no longer updates the initial context.
    await lastChatInput.press('x')
    await clickEditorTab(page, 'README.md')
    await expect(chatInputMentions(lastChatInput)).toHaveText([
        '@host.example/user/myrepo',
        '@main.c:1-3',
    ])
})
