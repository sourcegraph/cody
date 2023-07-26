import { GitInfo, GraphContextFetcher } from './index'

export class WebGraphContextFetcher extends GraphContextFetcher {
    public getGitInfo(workspaceRoot: string): Promise<GitInfo> {
        // const remote = runGitCommand(['remote', 'get-url', 'origin'], workspaceRoot)
        // const commitID = runGitCommand(['rev-parse', 'HEAD'], workspaceRoot)
        // const repo = convertGitCloneURLToCodebaseName(remote) || ''
        console.log('WebGraphContextFetcher')
        return Promise.resolve({ repo: '', commitID: '' })
    }
}
