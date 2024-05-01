import { URI } from 'vscode-uri'
import { ContextItemSource, type ContextItemWithContent } from '../../codebase-context/messages'
import { githubClient } from '../../githubClient'
import type { ContextItemFromProvider, ContextMentionProvider, ContextMentionProviderID } from '../api'

const GithubContextId: ContextMentionProviderID = 'github'

class GithubContextMentionProvider implements ContextMentionProvider<typeof GithubContextId> {
    public id = GithubContextId
    public triggerPrefixes = ['github:', 'gh:']

    async queryContextItems(query: string, signal?: AbortSignal) {
        const [_, arg1, arg2] = query.split(':')

        const number = Number(arg2)
        if (!number) {
            return []
        }

        const owner = 'sourcegraph'
        const repoName = 'cody'

        switch (arg1) {
            case 'pull':
            case 'pr':
                return this.getPullRequestItems({ owner, repoName, pullNumber: number }, signal)

            case 'issue':
                return this.getIssueItems({ owner, repoName, issueNumber: number }, signal)

            default:
                return []
        }
    }

    async resolveContextItem(item: ContextItemFromProvider<typeof GithubContextId>) {
        switch (item.type) {
            case 'github_pull_request':
                return this.getPullRequestItemsWithContent(item)

            case 'github_issue':
                return this.getIssueItemsWithContent(item)

            default:
                return []
        }
    }

    private async getPullRequestItems(
        details: { owner: string; repoName: string; pullNumber: number },
        signal?: AbortSignal
    ): Promise<ContextItemFromProvider<typeof GithubContextId>[]> {
        try {
            const pullRequest = await githubClient.request(
                'GET /repos/{owner}/{repo}/pulls/{pull_number}',
                {
                    owner: details.owner,
                    repo: details.repoName,
                    pull_number: details.pullNumber,
                }
            )

            signal?.throwIfAborted?.()

            if (!pullRequest) {
                return []
            }

            return [
                {
                    ...details,
                    type: 'github_pull_request',
                    uri: URI.parse(pullRequest.html_url),
                    title: pullRequest.title,
                    source: ContextItemSource.Github,
                    provider: 'github',
                },
            ]
        } catch (error) {
            return []
        }
    }

    private async getIssueItems(
        details: { owner: string; repoName: string; issueNumber: number },
        signal?: AbortSignal
    ): Promise<ContextItemFromProvider<typeof GithubContextId>[]> {
        try {
            const issue = await githubClient.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
                owner: details.owner,
                repo: details.repoName,
                issue_number: details.issueNumber,
            })

            signal?.throwIfAborted?.()

            if (!issue) {
                return []
            }

            return [
                {
                    ...details,
                    type: 'github_issue',
                    uri: URI.parse(issue.html_url),
                    title: issue.title,
                    source: ContextItemSource.Github,
                    provider: 'github',
                },
            ]
        } catch {
            return []
        }
    }
    private async getPullRequestItemsWithContent(
        details: { owner: string; repoName: string; pullNumber: number },
        signal?: AbortSignal
    ): Promise<ContextItemWithContent[]> {
        try {
            const pullRequest = await githubClient.request(
                'GET /repos/{owner}/{repo}/pulls/{pull_number}',
                {
                    owner: details.owner,
                    repo: details.repoName,
                    pull_number: details.pullNumber,
                }
            )

            signal?.throwIfAborted?.()

            if (!pullRequest) {
                return []
            }

            // TODO: fetch additional context from github (comments, diff, reviews, build status, closing issues etc.)
            const content = `<pull_request>
    <title>${pullRequest.title}</title>
    <status>${pullRequest.state}</status>
    <body>${pullRequest.body}</body>
</pull_request>`

            return [
                {
                    ...details,
                    content,
                    type: 'github_pull_request',
                    uri: URI.parse(pullRequest.html_url),
                    title: pullRequest.title,
                    source: ContextItemSource.Github,
                    provider: 'github',
                },
            ]
        } catch (error) {
            return []
        }
    }

    private async getIssueItemsWithContent(
        details: { owner: string; repoName: string; issueNumber: number },
        signal?: AbortSignal
    ): Promise<ContextItemWithContent[]> {
        try {
            const issue = await githubClient.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
                owner: details.owner,
                repo: details.repoName,
                issue_number: details.issueNumber,
            })

            signal?.throwIfAborted?.()

            if (!issue) {
                return []
            }

            // TODO: fetch additional context from github (comments etc.)
            const content = `<issue>
    <title>${issue.title}</title>
    <status>${issue.state}</status>
    <body>${issue.body}</body>
</issue>`

            return [
                {
                    ...details,
                    content,
                    type: 'github_issue',
                    uri: URI.parse(issue.html_url),
                    title: issue.title,
                    source: ContextItemSource.Github,
                    provider: 'github',
                },
            ]
        } catch {
            return []
        }
    }
}

export const GITHUB_CONTEXT_MENTION_PROVIDER = new GithubContextMentionProvider()
