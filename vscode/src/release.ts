export type ReleaseType = 'stable' | 'insiders'

export const majorVersion = (version: string): string => version.split('.')[0]

export const minorVersion = (version: string): string => version.split('.')[1]

export const majorMinorVersion = (version: string): string => [majorVersion(version), minorVersion(version)].join('.')

export const releaseType = (version: string): ReleaseType =>
    Number(minorVersion(version)) % 2 === 1 ? 'insiders' : 'stable'

export const releaseNotesURL = (version: string): string =>
    releaseType(version) === 'stable'
        ? `https://github.com/sourcegraph/cody/releases/tag/vscode-v${version}`
        : 'https://github.com/sourcegraph/cody/blob/main/vscode/CHANGELOG.md'
