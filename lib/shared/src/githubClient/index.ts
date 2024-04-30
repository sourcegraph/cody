import { Octokit } from '@octokit/core'
import type { Endpoints, RequestParameters } from '@octokit/types'

export interface GithubClientConfig {
    authToken: string
}

export type GithubEndpoints = Endpoints

export class GithubClient {
    private octokit: Octokit

    constructor(config: GithubClientConfig) {
        this.octokit = new Octokit({ auth: config.authToken })
    }

    onConfigurationChange(config: GithubClientConfig) {
        this.octokit = new Octokit({ auth: config.authToken })
    }

    async request<E extends keyof Endpoints>(
        req: E,
        params: E extends keyof Endpoints
            ? Endpoints[E]['parameters'] & RequestParameters
            : RequestParameters
    ): Promise<Endpoints[E]['response']['data']> {
        const response = await this.octokit.request(req, params)

        return response?.data
    }
}

export const githubClient = new GithubClient({ authToken: 'ghp_***' })
