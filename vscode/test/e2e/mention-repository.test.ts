import { expect } from '@playwright/test'

import type { RepoSearchResponse } from '@sourcegraph/cody-shared'
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

    server.onGraphQl('RepositoriesSearch').replyJson({
        data: {
            repositories: {
                nodes: [
                    {
                        id: 'a/b',
                        name: 'a/b',
                        url: 'https://example.com/a/b',
                    },
                    {
                        id: 'c/d',
                        name: 'c/d',
                        url: 'https://example.com/c/d',
                    },
                ],
                pageInfo: {
                    endCursor: 'c/d',
                },
            },
        } satisfies RepoSearchResponse,
    })

    await openMentionsForProvider(chatFrame, lastChatInput, 'Remote Repositories')
    await expect(mentionMenuItems(chatFrame)).toHaveText([
        '@host.example/user/myrepoEntire codebase context',
        'a/b',
        'c/d',
    ])
    await selectMentionMenuItem(chatFrame, 'c/d')
    await expect(chatInputMentions(lastChatInput)).toHaveText(['@host.example/user/myrepo', '@c/d'])
})
