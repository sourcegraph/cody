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
    mockEnterpriseRepoMapping(server, 'host.example/user/myrepo')

    await sidebarSignin(page, sidebar)
    const [chatFrame, lastChatInput] = await createEmptyChatPanel(page)

    server.onGraphQl('SuggestionsRepo').replyJson({
        data: {
            search: {
                results: {
                    repositories: [
                        {
                            id: 'a/b',
                            name: 'a/b',
                            stars: 10,
                            url: 'https://example.com/a/b',
                        },
                        {
                            id: 'c/d',
                            name: 'c/d',
                            stars: 9,
                            url: 'https://example.com/c/d',
                        },
                    ],
                },
            },
        } satisfies RepoSuggestionsSearchResponse,
    })

    await openMentionsForProvider(chatFrame, lastChatInput, 'Remote Repositories')
    await expect(mentionMenuItems(chatFrame)).toHaveText(['a/b', 'c/d'])
    await selectMentionMenuItem(chatFrame, 'c/d')
    await expect(chatInputMentions(lastChatInput)).toHaveText(['host.example/user/myrepo', 'c/d'])
})
