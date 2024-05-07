export interface RepoMetaData {
    owner: string
    repoName: string
    isPublic: boolean
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
        const ownerAndRepoName = this.parserOwnerAndRepoName(gitUrl)
        if (!ownerAndRepoName) {
            return undefined
        }
        const repoMetaData = await this.queryGitHubApi(ownerAndRepoName.owner, ownerAndRepoName.repoName)
        return repoMetaData
    }

    private async queryGitHubApi(owner: string, repoName: string): Promise<RepoMetaData | undefined> {
        const apiUrl = `https://api.github.com/repos/${owner}/${repoName}`
        const metadata = { owner, repoName, isPublic: false }
        try {
            const response = await fetch(apiUrl, { method: 'HEAD' })
            const repoData = await response.json()
            metadata.isPublic = response.ok && repoData.private === false
            return metadata
        } catch (error) {
            return undefined
        }
    }

    private parserOwnerAndRepoName(gitUrl: string): { owner: string; repoName: string } | undefined {
        const match = gitUrl?.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
        if (!match) {
            return undefined
        }
        const [, owner, repoName] = match
        return { owner, repoName }
    }
}
