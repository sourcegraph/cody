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

    // Wait for the current user repo to be loaded before opening the mention menu.
    await expect(chatInputMentions(lastChatInput)).toHaveText([userRepo])
    await openMentionsForProvider(chatFrame, lastChatInput, 'Remote Repositories')
    await expect(mentionMenuItems(chatFrame)).toHaveText(['a/b', 'c/d'])
    await selectMentionMenuItem(chatFrame, 'c/d')
    await expect(chatInputMentions(lastChatInput)).toHaveText([userRepo, 'codehost.example/c/d'])
})
