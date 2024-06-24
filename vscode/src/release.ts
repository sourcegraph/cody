import { CodyIDE } from '@sourcegraph/cody-shared'

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
            return isStable
                ? `https://github.com/sourcegraph/cody/releases/tag/vscode-v${version}`
                : 'https://github.com/sourcegraph/cody/blob/main/vscode/CHANGELOG.md'

        case CodyIDE.JetBrains:
            return isStable
                ? `https://github.com/sourcegraph/jetbrains/releases/tag/v${version}`
                : 'https://github.com/sourcegraph/jetbrains/releases'

        default:
            throw new Error('IDE not supported')
    }
}
