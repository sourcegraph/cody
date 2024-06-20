type ReleaseType = 'stable' | 'insiders'

const majorVersion = (version: string): string => version.split('.')[0]

const minorVersion = (version: string): string => version.split('.')[1]

export const majorMinorVersion = (version: string): string =>
    [majorVersion(version), minorVersion(version)].join('.')

export const releaseType = (version: string): ReleaseType =>
    Number(minorVersion(version)) % 2 === 1 ? 'insiders' : 'stable'

const RELEASE_BLOG_POSTS: Record<string, string> = {
    '1.20': 'https://sourcegraph.com/blog/cody-vscode-1-20-0-release',
}

export const releaseNotesURL = (version: string): string => {
    const blogPostURL = RELEASE_BLOG_POSTS[majorMinorVersion(version)]
    return (
        blogPostURL ??
        (releaseType(version) === 'stable'
            ? `https://github.com/sourcegraph/cody/releases/tag/vscode-v${version}`
            : 'https://github.com/sourcegraph/cody/blob/main/vscode/CHANGELOG.md')
    )
}
