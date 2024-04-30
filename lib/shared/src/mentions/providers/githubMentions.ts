import { URI } from 'vscode-uri'
import {
    type ContextItemPackage,
    ContextItemSource,
    type ContextItemWithContent,
} from '../../codebase-context/messages'
import { githubClient } from '../../githubClient'
import type { PromptString } from '../../prompt/prompt-string'
import { graphqlClient } from '../../sourcegraph-api/graphql'
import { isError } from '../../utils'
import type { ContextItemFromProvider, ContextMentionProvider, ContextMentionProviderID } from '../api'

const GithubContextId: ContextMentionProviderID = 'github'

class GithubContextMentionProvider implements ContextMentionProvider<typeof GithubContextId> {
    public id = GithubContextId
    public triggerPrefixes = ['github:', 'gh:']

    async queryContextItems(query: string) {
        const [_, arg1, arg2] = query.split(':')

        const number = Number(arg2)
        if (!number) {
            return []
        }

        switch (arg1) {
            case 'pull':
                return this.getPullRequestItems(number)

            case 'issue':
                return this.getIssueItems(number)
            // todo: add support for issues

            default:
                return []
        }
    }

    private async getPullRequestItems(
        pullNumber: number
    ): Promise<ContextItemFromProvider<typeof GithubContextId>[]> {
        const owner = 'sourcegraph'
        const repoName = 'cody'
        try {
            const pullRequest = await githubClient.request(
                'GET /repos/{owner}/{repo}/pulls/{pull_number}',
                {
                    owner,
                    repo: repoName,
                    pull_number: pullNumber,
                }
            )

            if (!pullRequest) {
                return []
            }

            return [
                {
                    type: 'github_pull_request',
                    uri: URI.parse(pullRequest.url),
                    title: pullRequest.title,
                    content: `Title: "${pullRequest.title}\nBody:  \`\`\`${pullRequest.body}\`\`\`"`,
                    source: ContextItemSource.Github,
                    owner,
                    repoName,
                    pullNumber,
                    provider: 'github',
                },
            ]
        } catch (error) {
            return []
        }
    }

    private async getIssueItems(
        issueNumber: number
    ): Promise<ContextItemFromProvider<typeof GithubContextId>[]> {
        const owner = 'sourcegraph'
        const repoName = 'cody'
        try {
            const issue = await githubClient.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
                owner,
                repo: repoName,
                issue_number: issueNumber,
            })

            if (!issue) {
                return []
            }

            return [
                {
                    type: 'github_issue',
                    uri: URI.parse(issue.url),
                    title: issue.title,
                    content: `Title: "${issue.title}"\nBody:  \`\`\`${issue.body}\`\`\`"`,
                    source: ContextItemSource.Github,
                    owner,
                    repoName,
                    issueNumber,
                    provider: 'github',
                },
            ]
        } catch {
            return []
        }
    }

    async resolveContextItem(item: ContextItemFromProvider<typeof GithubContextId>) {
        return [item as ContextItemWithContent]
    }
}

export async function findContextItemsWithContentForPackage(
    packageContextItem: ContextItemPackage,
    query: PromptString
): Promise<ContextItemWithContent[]> {
    // Sending prompt strings to the Sourcegraph search backend is fine.
    const result = await graphqlClient.contextSearch(
        new Set([packageContextItem.repoID]),
        query.toString()
    )
    if (isError(result) || result === null) {
        return []
    }

    return result.map(node => ({
        type: 'file',
        uri: node.uri,
        title: node.path,
        repoName: node.repoName,
        content: node.content,
        range: {
            start: { line: node.startLine, character: 0 },
            end: { line: node.endLine, character: 0 },
        },
        source: ContextItemSource.Package,
    }))
}

export const GITHUB_CONTEXT_MENTION_PROVIDER = new GithubContextMentionProvider()
