import { CodyIDE } from '@sourcegraph/cody-shared'
import { SG_CHANGELOG_URL } from './chat/protocol'

type ReleaseType = 'stable' | 'insiders'

const majorVersion = (version: string): string => version.split('.')[0]

const minorVersion = (version: string): string => version.split('.')[1]

export const majorMinorVersion = (version: string): string =>
    [majorVersion(version), minorVersion(version)].join('.')

/**
 * Determines the release type (stable or insiders) for the given IDE and version.
 *
 * @param IDE - The IDE to get the release type for.
 * @param version - The version of the IDE.
 * @returns The release type ('stable' or 'insiders') for the given IDE and version.
 */
export function getReleaseTypeByIDE(IDE: CodyIDE, version: string): ReleaseType {
    switch (IDE) {
        case CodyIDE.VSCode:
            return Number(minorVersion(version)) % 2 === 1 ? 'insiders' : 'stable'

        case CodyIDE.JetBrains:
            return version.endsWith('-nightly') ? 'insiders' : 'stable'

        // Add new IDEs here

        default:
            throw new Error('IDE not supported')
    }
}

const IDE_BLOG_TOPICS = {
    [CodyIDE.VSCode]: 'VS Code',
    [CodyIDE.JetBrains]: 'JetBrains',
    [CodyIDE.VisualStudio]: 'Visual Studio',
    [CodyIDE.Eclipse]: 'Eclipse',
    // Generic topics for IDEs without UI.
    [CodyIDE.Neovim]: 'Cody',
    [CodyIDE.Emacs]: 'Cody',
    [CodyIDE.Web]: 'Cody',
}

/**
 * Determines the URL for the release notes for the given IDE and version.
 *
 * If the IDE has a corresponding blog topic in `IDE_BLOG_TOPICS`,
 * the release notes URL will be a link to the Sourcegraph changelog with the blog topic as a filter.
 * Otherwise, the release notes URL will be a link to the GitHub releases page for the given version,
 * or the general releases page if the version is an 'insiders' release.
 *
 * @param version - The version of the IDE.
 * @param IDE - The IDE to get the release notes URL for.
 * @returns The URL for the release notes for the given IDE and version.
 */
export function getReleaseNotesURLByIDE(version: string, IDE: CodyIDE): string {
    const blogTopic = IDE in IDE_BLOG_TOPICS && IDE_BLOG_TOPICS[IDE as keyof typeof IDE_BLOG_TOPICS]
    if (IDE in IDE_BLOG_TOPICS && blogTopic) {
        const blogURL = new URL(SG_CHANGELOG_URL)
        blogURL.searchParams.set('topics', blogTopic)
        return blogURL.href
    }

    const isStable = getReleaseTypeByIDE(IDE, version) === 'stable'
    return isStable
        ? `https://github.com/sourcegraph/cody/releases/tag/v${version}`
        : 'https://github.com/sourcegraph/cody/releases'
}
