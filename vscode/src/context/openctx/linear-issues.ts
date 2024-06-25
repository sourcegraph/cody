import type { Provider } from '@openctx/client'
import dedent from 'dedent'
import { XMLBuilder } from 'fast-xml-parser'
import * as vscode from 'vscode'

const xmlBuilder = new XMLBuilder({ format: true })

interface Issue {
    identifier: string
    title: string
    url: string
    description: string
    comments?: {
        nodes: Comment[]
    }
}

interface Comment {
    body: string
}

const NUMBER_OF_ISSUES_TO_FETCH = 10

const LinearIssuesProvider: Provider & { providerUri: string } = {
    providerUri: 'internal-linear-issues',

    meta() {
        return { name: 'Linear Issues', mentions: {} }
    },

    async mentions({ query }) {
        let issues: Issue[] = []

        if (query) {
            const variables = { query, first: NUMBER_OF_ISSUES_TO_FETCH }
            const response = await linearApiRequest(issueSearchQuery, variables)
            issues = response.data.issueSearch.nodes as Issue[]
        } else {
            const variables = { first: NUMBER_OF_ISSUES_TO_FETCH / 2 }
            const response = await linearApiRequest(viewerIssuesQuery, variables)

            const createdIssues = response.data.viewer.createdIssues.nodes as Issue[]
            const assignedIssues = response.data.viewer.assignedIssues.nodes as Issue[]
            issues = dedupeWith([...assignedIssues, ...createdIssues], 'url')
        }

        const mentions = (issues ?? []).map(issue => ({
            title: `${issue.identifier} ${issue.title}`,
            uri: issue.url,
            description: issue.description,
        }))

        return mentions
    },

    async items(params) {
        if (!params.mention) {
            return []
        }

        const issueId = parseIssueIDFromURL(params.mention.uri)
        if (!issueId) {
            return []
        }

        const variables = { id: issueId }
        const data = await linearApiRequest(issueWithCommentsQuery, variables)
        const issue = data.data.issue as Issue
        const comments = issue.comments?.nodes as Comment[]

        const issueInfo = xmlBuilder.build({
            title: issue.title,
            description: issue.description || '',
            comments: comments.map(comment => comment.body).join('\n'),
            url: issue.url,
        })
        const content = dedent`
            Here is the Linear issue. Use it to check if it helps.
            Ignore it if it is not relevant.

            ${issueInfo}
        `

        return [
            {
                title: issue.title,
                url: issue.url,
                ai: {
                    content,
                },
            },
        ]
    },
}

export default LinearIssuesProvider

const LINEAR_AUTHENTICATION_EXTENSION_ID = 'linear.linear-connect'
const LINEAR_AUTHENTICATION_PROVIDER_ID = 'linear'
const LINEAR_AUTHENTICATION_SCOPES = ['read']

async function linearApiRequest(query: string, variables: object): Promise<{ data: any }> {
    const ext = vscode.extensions.getExtension(LINEAR_AUTHENTICATION_EXTENSION_ID)
    if (!ext) {
        vscode.window.showWarningMessage(
            'Cody requires the Linear Connect extension to be installed and activated.'
        )
        await vscode.commands.executeCommand('workbench.extensions.action.showExtensionsWithIds', [
            [LINEAR_AUTHENTICATION_EXTENSION_ID],
        ])
    }

    const session = await vscode.authentication.getSession(
        LINEAR_AUTHENTICATION_PROVIDER_ID,
        LINEAR_AUTHENTICATION_SCOPES,
        { createIfNone: true }
    )

    if (!session) {
        throw new Error(`We weren't able to log you into Linear when trying to open the issue.`)
    }

    const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
        throw new Error(`Linear API request failed: ${response.statusText}`)
    }

    const json = (await response.json()) as { data: object }

    if (!json.data) {
        throw new Error('Linear API request failed: no data')
    }

    return json
}

function parseIssueIDFromURL(urlStr: string): string | undefined {
    const url = new URL(urlStr)
    if (!url.hostname.endsWith('linear.app')) {
        return undefined
    }
    const match = url.pathname.match(/\/issue\/([a-zA-Z0-9_-]+)/)
    return match ? match[1] : undefined
}

const dedupeWith = <T>(items: T[], key: keyof T | ((item: T) => string)): T[] => {
    const seen = new Set()
    const isKeyFunction = typeof key === 'function'

    return items.reduce((result, item) => {
        const itemKey = isKeyFunction ? key(item) : item[key]

        if (!seen.has(itemKey)) {
            seen.add(itemKey)
            result.push(item)
        }

        return result
    }, [] as T[])
}

const issueFragment = `
  fragment IssueFragment on Issue {
      identifier
      title
      url
      description
  }
`
const viewerIssuesQuery = `
  query ViewerIssues($first: Int!) {
    viewer {
      createdIssues(first: $first, orderBy: updatedAt) {
        nodes {
          ...IssueFragment
        }
      }
      assignedIssues(first: $first, orderBy: updatedAt) {
        nodes {
          ...IssueFragment
        }
      }
    }
  }

  ${issueFragment}
`
const issueSearchQuery = `
    query IssueSearch($query: String!, $first: Int!) {
        issueSearch(query: $query, first: $first, orderBy: updatedAt) {
            nodes {
              ...IssueFragment
            }
        }
    }

    ${issueFragment}
`
const issueWithCommentsQuery = `
  query IssueWithComment($id: String!) {
    issue(id: $id) {
      ...IssueFragment
      comments {
        nodes {
          body
        }
      }
    }
  }

  ${issueFragment}
`
