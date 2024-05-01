export interface RepoMetaData {
    owner: string
    repoName: string
    repoVisibility: 'public' | 'private'
}

export class RepoMetadatafromGitApi {
    // This class is used to get the metadata from the gitApi.
    // It is primarily meant to get the
    private static instance: RepoMetadatafromGitApi | null = null
    private cache = new Map<string, RepoMetaData | undefined>()

    private constructor() {}

    public static getInstance(): RepoMetadatafromGitApi {
        if (!RepoMetadatafromGitApi.instance) {
            RepoMetadatafromGitApi.instance = new RepoMetadatafromGitApi()
        }
        return RepoMetadatafromGitApi.instance
    }

    public async getRepoMetadataUsingGitUrl(gitUrl: string): Promise<RepoMetaData | undefined> {
        if (this.cache.has(gitUrl)) {
            return this.cache.get(gitUrl)
        }
        const repoMetaData = await this.metadataFromGit(gitUrl)
        this.cache.set(gitUrl, repoMetaData)
        return repoMetaData
    }

    private async metadataFromGit(gitUrl: string): Promise<RepoMetaData | undefined> {
        if (!this.isValidGitUrl(gitUrl)) {
            return undefined
        }
        const ownerAndRepoName = this.parserOwnerAndRepoName(gitUrl)
        if (!ownerAndRepoName) {
            return undefined
        }
        const owner = ownerAndRepoName.owner
        const repoName = ownerAndRepoName.repoName
        const repoMetaData = await this.queryGitApi(owner, repoName)
        return repoMetaData
    }

    private async queryGitApi(owner: string, repoName: string): Promise<RepoMetaData | undefined> {
        const apiUrl = `https://api.github.com/repos/${owner}/${repoName}`
        try {
            const response = await fetch(apiUrl)
            if (!response.ok) {
                return undefined
            }
            const repoData = await response.json()
            return {
                owner,
                repoName,
                repoVisibility: repoData.private ? 'private' : 'public',
            }
        } catch (error) {
            return undefined
        }
    }

    private parserOwnerAndRepoName(gitUrl: string): { owner: string; repoName: string } | undefined {
        if (!this.isValidGitUrl(gitUrl)) {
            return undefined
        }
        const gitUrlParts = gitUrl.split('/')
        if (gitUrlParts.length < 2) {
            return undefined
        }
        const owner = gitUrlParts[gitUrlParts.length - 2]
        const repoName = gitUrlParts[gitUrlParts.length - 1].replace('.git', '')
        return { owner, repoName }
    }

    private isValidGitUrl(gitUrl: string): boolean {
        const githubUrlPattern: RegExp = /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+.git$/
        return githubUrlPattern.test(gitUrl)
    }
}
