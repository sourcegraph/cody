import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'
import {
    chatInputMentions,
    clickEditorTab,
    createEmptyChatPanel,
    getChatInputs,
    getChatSidebarPanel,
    openFileInEditorTab,
    selectLineRangeInEditorTab,
    sidebarSignin,
} from './common'
import { type DotcomUrlOverride, mockEnterpriseRepoMapping, testWithGitRemote } from './helpers'

testWithGitRemote.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })(
    'initial context - self-serve repo',
    async ({ page, sidebar }) => {
        await sidebarSignin(page, sidebar)
        const chatFrame = getChatSidebarPanel(page)
        const lastChatInput = getChatInputs(chatFrame).last()

        // The current repository should be initially present in the chat input.
        await expect(chatInputMentions(lastChatInput)).toHaveText(['myrepo'])
    }
)

testWithGitRemote('initial context - enterprise repo', async ({ page, sidebar, server }) => {
    mockEnterpriseRepoMapping(server, 'host.example/user/myrepo')

    await sidebarSignin(page, sidebar)
    const [, lastChatInput] = await createEmptyChatPanel(page)

    // The current repository should be initially present in the chat input.
    await expect(chatInputMentions(lastChatInput)).toHaveText(['host.example/user/myrepo'])
})

testWithGitRemote('initial context - file', async ({ page, sidebar, server }) => {
    mockEnterpriseRepoMapping(server, 'host.example/user/myrepo')

    await sidebarSignin(page, sidebar)

    await openFileInEditorTab(page, 'main.c')

    const [, lastChatInput] = await createEmptyChatPanel(page)

    await expect(chatInputMentions(lastChatInput)).toHaveText(['main.c', 'host.example/user/myrepo'])
    // Initial context should not include current selection. Current selection should be added explicitly.
    await selectLineRangeInEditorTab(page, 2, 4)
    await expect(chatInputMentions(lastChatInput)).toHaveText(['main.c', 'host.example/user/myrepo'])

    await selectLineRangeInEditorTab(page, 1, 3)
    await expect(chatInputMentions(lastChatInput)).toHaveText(['main.c', 'host.example/user/myrepo'])

    await openFileInEditorTab(page, 'README.md')
    await expect(chatInputMentions(lastChatInput)).toHaveText(['README.md', 'host.example/user/myrepo'])

    await clickEditorTab(page, 'main.c')
    await expect(chatInputMentions(lastChatInput)).toHaveText(['main.c', 'host.example/user/myrepo'])

    // After typing into the input, it no longer updates the initial context.
    await lastChatInput.press('x')
    await clickEditorTab(page, 'README.md')
    await expect(chatInputMentions(lastChatInput)).toHaveText(['main.c', 'host.example/user/myrepo'])
})
