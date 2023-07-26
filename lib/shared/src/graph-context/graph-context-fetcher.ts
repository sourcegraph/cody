import { spawnSync } from 'child_process'

import { convertGitCloneURLToCodebaseName } from '../utils'

import { GitInfo, GraphContextFetcher } from './index'

export class VSCodeGraphContextFetcher extends GraphContextFetcher {
    public getGitInfo(workspaceRoot: string): Promise<GitInfo> {
        const remote = runGitCommand(['remote', 'get-url', 'origin'], workspaceRoot)
        const commitID = runGitCommand(['rev-parse', 'HEAD'], workspaceRoot)
        const repo = convertGitCloneURLToCodebaseName(remote) || ''

        return Promise.resolve({ repo, commitID })
    }
}

function runGitCommand(args: string[], workspaceRoot: string): string {
    return spawnSync('git', args, { cwd: workspaceRoot }).stdout.toString().trim()
}
