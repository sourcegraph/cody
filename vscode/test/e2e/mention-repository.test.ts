import { expect } from '@playwright/test'

import type { RepoSuggestionsSearchResponse } from '@sourcegraph/cody-shared'
import {
    chatInputMentions,
    createEmptyChatPanel,
    mentionMenuItems,
    openMentionsForProvider,
    selectMentionMenuItem,
    sidebarSignin,
} from './common'
import { mockEnterpriseRepoMapping, testWithGitRemote } from './helpers'

testWithGitRemote('@-mention repository', async ({ page, sidebar, server }) => {
    const userRepo = 'codehost.example/user/myrepo'
    mockEnterpriseRepoMapping(server, userRepo)

    await sidebarSignin(page, sidebar)
    const [chatFrame, lastChatInput] = await createEmptyChatPanel(page)

    server.onGraphQl('SuggestionsRepo').replyJson({
        data: {
            search: {
                results: {
                    repositories: [
                        {
                            id: userRepo,
                            name: userRepo,
                            stars: 15,
                            url: `https://${userRepo}`,
                        },
                        {
                            id: 'codehost.example/a/b',
                            name: 'codehost.example/a/b',
                            stars: 10,
                            url: 'https://codehost.example/a/b',
                        },
                        {
                            id: 'codehost.example/c/d',
                            name: 'codehost.example/c/d',
                            stars: 9,
                            url: 'https://codehost.example/c/d',
                        },
                    ],
                },
            },
        } satisfies RepoSuggestionsSearchResponse,
    })

    // Wait for the initial context to be loaded (should contain local workspace folder)
    await expect(chatInputMentions(lastChatInput)).toHaveCount(1, { timeout: 10000 })
    await expect(chatInputMentions(lastChatInput)).toHaveText(['myrepo'])

    // Test that remote repositories are available via the mention menu
    await openMentionsForProvider(chatFrame, lastChatInput, 'Repositories', true)
    // The mention menu shows shortened repository names for display
    await expect(mentionMenuItems(chatFrame)).toHaveText(['user/myrepo', 'a/b', 'c/d'])

    await selectMentionMenuItem(chatFrame, 'user/myrepo')
    await expect(chatInputMentions(lastChatInput)).toHaveText(['myrepo', userRepo])
})
