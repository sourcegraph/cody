import { CodyIDE } from '@sourcegraph/cody-shared'
import { SG_BLOG_URL } from './chat/protocol'

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

/**
 * Gets the release notes URL for the given IDE and version.
 *
 * NOTE: Each IDE is responsible for generating its own release notes.
 *
 * @param version - The version of the IDE.
 * @param IDE - The IDE to get the release notes URL for.
 * @returns The release notes URL for the given IDE and version.
 */
export function getReleaseNotesURLByIDE(version: string, IDE: CodyIDE): string {
    const isStable = getReleaseTypeByIDE(IDE, version) === 'stable'

    switch (IDE) {
        case CodyIDE.VSCode:
            return getReleaseBlogPostURL(version, IDE)

        case CodyIDE.JetBrains:
            return isStable
                ? `https://github.com/sourcegraph/jetbrains/releases/tag/v${version}`
                : 'https://github.com/sourcegraph/jetbrains/releases'

        default:
            throw new Error(`No release note for ${IDE}.`)
    }
}

/**
 * Gets the release blog post URL for the given IDE and version.
 *
 * This function constructs the release blog post URL for the given IDE and version.
 * For VS Code, it constructs the blog URL based on the version number.
 *
 * @param version - The version of the IDE.
 * @param IDE - The IDE to get the release blog post URL for.
 * @returns The release blog post URL for the given IDE and version.
 */
function getReleaseBlogPostURL(version: string, IDE: CodyIDE): string {
    const blogURL = new URL(SG_BLOG_URL)

    if (IDE === CodyIDE.VSCode) {
        // Examples of version:
        // 1.24.3 (stable), 1.25.123143 (pre-release)
        const versionNums = version.split('.')
        // NOTE: We do not generate blog post for pre-releases (odd minor number).
        const minor = Number(versionNums[1]) % 2 === 0 ? versionNums[1] : `${Number(versionNums[1]) - 1}`
        // Example: https://sourcegraph.com/blog/cody-vscode-1-24-0-release
        blogURL.pathname += `cody-vscode-${versionNums[0]}-${minor}-0-release`
    }

    return blogURL.href
}
