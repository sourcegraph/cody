import { URI } from 'vscode-uri'
import xml2js from 'xml2js'
import {
    ContextItemSource,
    type ContextItemWithContent
} from '../../codebase-context/messages'
import { githubClient } from '../../githubClient'
import type {
    ContextItemFromProvider,
    ContextItemProps,
    ContextMentionProvider,
    ContextMentionProviderID
} from '../api'

const GithubContextId: ContextMentionProviderID = 'github'

const xmlBuilder = new xml2js.Builder({
    headless: true
})

class GithubContextMentionProvider
    implements ContextMentionProvider<typeof GithubContextId> {
    public id = GithubContextId;
    public triggerPrefixes = ['github:', 'gh:'];

    async queryContextItems(query: string, props: ContextItemProps, signal?: AbortSignal) {
        /* supported query formats:
         * - github:issue:1234
         * - github:issue:sourcegraph/cody/1234
         */
        const [_, kind, id] = query.split(':')

        if (!kind || !id) {
            return []
        }
        const [ownerOrNumber = '', repoName = '', numberText = ''] = id.split('/')

        const number = ownerOrNumber && repoName ? Number(numberText) : Number(ownerOrNumber)
        if (!number) {
            return []
        }

        let codebases: { owner: string, repoName: string }[] = []

        if (ownerOrNumber && repoName) {
            codebases = [{ owner: ownerOrNumber, repoName }]
        } else {
            codebases = props.gitRemotes.filter(remote => remote.hostname === 'github.com')
        }


        return (await Promise.all(codebases.map(async (codebase) => {
            switch (kind) {
                case 'pull':
                case 'pr':
                    return this.getPullRequestItems(
                        { ...codebase, pullNumber: number },
                        signal
                    )

                case 'issue':
                    return this.getIssueItems(
                        { ...codebase, issueNumber: number },
                        signal
                    )

                default:
                    return []
            }
        }))).flat() as ContextItemFromProvider<typeof GithubContextId>[]
    }

    async resolveContextItem(
        item: ContextItemFromProvider<typeof GithubContextId>
    ) {
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
                    pull_number: details.pullNumber
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
                    title: `#${pullRequest.number} ${pullRequest.title}`,
                    source: ContextItemSource.Github,
                    provider: 'github'
                }
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
            const issue = await githubClient.request(
                'GET /repos/{owner}/{repo}/issues/{issue_number}',
                {
                    owner: details.owner,
                    repo: details.repoName,
                    issue_number: details.issueNumber
                }
            )

            signal?.throwIfAborted?.()

            if (!issue) {
                return []
            }

            return [
                {
                    ...details,
                    type: 'github_issue',
                    uri: URI.parse(issue.html_url),
                    title: `#${issue.number} ${issue.title}`,
                    source: ContextItemSource.Github,
                    provider: 'github'
                }
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
                    pull_number: details.pullNumber
                }
            )

            signal?.throwIfAborted?.()

            if (!pullRequest) {
                return []
            }

            const [diff, comments, reviewComments] = await Promise.all([
                githubClient
                    .request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
                        owner: details.owner,
                        repo: details.repoName,
                        pull_number: details.pullNumber,
                        mediaType: {
                            format: 'diff'
                        }
                    })
                    .catch(() => ''),
                githubClient
                    .request(
                        'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
                        {
                            owner: details.owner,
                            repo: details.repoName,
                            issue_number: details.pullNumber,
                            per_page: 100
                        }
                    )
                    .catch(() => [])
                ,
                githubClient
                    .request(
                        'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
                        {
                            owner: details.owner,
                            repo: details.repoName,
                            pull_number: details.pullNumber,
                            per_page: 100
                        }
                    )
                    .catch(() => [])
            ])

            signal?.throwIfAborted?.()

            const content = xmlBuilder.buildObject({
                pull_request: {
                    url: pullRequest.html_url,
                    title: pullRequest.title,
                    branch: pullRequest.head.ref,
                    author: pullRequest.user.login,
                    created_at: pullRequest.created_at,
                    merged: pullRequest.merged,
                    merged_at: pullRequest.merged_at,
                    mergeable: pullRequest.mergeable,
                    status: pullRequest.state,
                    body: pullRequest.body,
                    diff: diff,
                    comments: comments.map((comment) => ({
                        url: comment.html_url,
                        author: comment.user?.login,
                        body: comment.body,
                        created_at: comment.created_at
                    })),
                    reviews: reviewComments.map((review) => ({
                        url: review.html_url,
                        author: review.user.login,
                        body: review.body,
                        created_at: review.created_at,
                        file_path: review.path,
                        diff: review.diff_hunk,
                    }))
                }
            })

            return [
                {
                    ...details,
                    content,
                    type: 'github_pull_request',
                    uri: URI.parse(pullRequest.html_url),
                    title: pullRequest.title,
                    source: ContextItemSource.Github,
                    provider: 'github'
                }
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
            const issue = await githubClient.request(
                'GET /repos/{owner}/{repo}/issues/{issue_number}',
                {
                    owner: details.owner,
                    repo: details.repoName,
                    issue_number: details.issueNumber
                }
            )

            signal?.throwIfAborted?.()

            if (!issue) {
                return []
            }

            const comments = await githubClient
                .request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
                    owner: details.owner,
                    repo: details.repoName,
                    issue_number: details.issueNumber,
                    per_page: 100
                })
                .catch(() => [])

            const content = xmlBuilder.buildObject({
                issue: {
                    url: issue.html_url,
                    title: issue.title,
                    author: issue.user?.login,
                    created_at: issue.created_at,
                    status: issue.state,
                    body: issue.body,
                    comments: comments.map((comment) => ({
                        url: comment.html_url,
                        author: comment.user?.login,
                        body: comment.body,
                        created_at: comment.created_at
                    }))
                }
            })

            return [
                {
                    ...details,
                    content,
                    type: 'github_issue',
                    uri: URI.parse(issue.html_url),
                    title: issue.title,
                    source: ContextItemSource.Github,
                    provider: 'github'
                }
            ]
        } catch {
            return []
        }
    }
}

export const GITHUB_CONTEXT_MENTION_PROVIDER =
    new GithubContextMentionProvider()
