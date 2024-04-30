import { Octokit } from '@octokit/core'
import { i } from 'vitest/dist/reporters-LqC_WI4d'

type GithubClientConfig {
    authToken: string
}

export class GithubClient {
    private octokit: Octokit

    constructor(config:  GithubClientConfig) {
        this.octokit = new Octokit({ auth: config.authToken })
    }

    onConfigurationChange(config: GithubClientConfig) {
        this.octokit = new Octokit({ auth: config.authToken })
    }

    getIssueOrPullRequest(variables: {owner: string, repository: string, number: number}) {
       this.octokit.graphql(`
        query ($owner: String!, $repository: String!, $number: Int!) {
            repository(name: $repository, owner: $owner) {
                issueOrPullRequest(number: $number) {
                   ... on PullRequest {
                        number
                        title
                        url
                        body
                    }
                   ... on Issue {
                        number
                        title
                        url
                        body
                    }
                }
            }
        }
       `, variables)
    }
}


export const githubClient = new GithubClient({authToken: ""})
