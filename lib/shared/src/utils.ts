export const isError = (value: unknown): value is Error => value instanceof Error

// Converts a git clone URL to the codebase name that includes the slash-separated code host, owner, and repository name
// This should captures:
// - "github:sourcegraph/sourcegraph" a common SSH host alias
// - "https://github.com/sourcegraph/deploy-sourcegraph-k8s.git"
// - "git@github.com:sourcegraph/sourcegraph.git"
// - "https://dev.azure.com/organization/project/_git/repository"

export function convertGitCloneURLToCodebaseName(cloneURL: string): string | null {
    const result = convertGitCloneURLToCodebaseNameOrError(cloneURL)
    if (isError(result)) {
        if (result.message) {
            if (result.cause) {
                console.error(result.message, result.cause)
            } else {
                console.error(result.message)
            }
        }
        return null
    }
    return result
}

export function convertGitCloneURLToCodebaseNameOrError(cloneURL: string): string | Error {
    if (!cloneURL) {
        return new Error(`Unable to determine the git clone URL for this workspace.\ngit output: ${cloneURL}`)
    }
    try {
        // Handle common Git SSH URL format
        const match = cloneURL.match(/^[\w-]+@([^:]+):([\w-]+)\/([\w-]+)(\.git)?$/)
        if (match) {
            const host = match[1]
            const owner = match[2]
            const repo = match[3]
            return `${host}/${owner}/${repo}`
        }
        const uri = new URL(cloneURL)
        // Handle Azure DevOps URLs
        if (uri.hostname && uri.hostname.includes('dev.azure') && uri.pathname) {
            return `${uri.hostname}${uri.pathname.replace('/_git', '')}`
        }
        // Handle GitHub URLs
        if (uri.protocol.startsWith('github') || uri.href.startsWith('github')) {
            return `github.com/${uri.pathname.replace('.git', '')}`
        }
        // Handle GitLab URLs
        if (uri.protocol.startsWith('gitlab') || uri.href.startsWith('gitlab')) {
            return `gitlab.com/${uri.pathname.replace('.git', '')}`
        }
        // Handle HTTPS URLs
        if (uri.protocol.startsWith('http') && uri.hostname && uri.pathname) {
            return `${uri.hostname}${uri.pathname.replace('.git', '')}`
        }
        // Generic URL
        if (uri.hostname && uri.pathname) {
            return `${uri.hostname}${uri.pathname.replace('.git', '')}`
        }
        return new Error('')
    } catch (error) {
        return new Error(`Cody could not extract repo name from clone URL ${cloneURL}:`, { cause: error })
    }
}
