import * as vscode from 'vscode'

import { version as packageVersion } from '../package.json'

export type ReleaseType = 'stable' | 'insiders'

// For insiders builds, packageVersion above will be wrong. This is because
// `pnpm build` bakes the version in to the source _before_ the the pre-release
// build modifies the package.json. So instead of packageVersion which may not
// match the version in package.json, we prefer the value given by
// vscode.extensions.getExtension.
export const version =
    (vscode.extensions.getExtension('sourcegraph.cody-ai')?.packageJSON as { version: string })?.version ??
    packageVersion

export const majorVersion = (version: string): string => version.split('.')[0]

export const minorVersion = (version: string): string => version.split('.')[1]

export const majorMinorVersion = (version: string): string => [majorVersion(version), minorVersion(version)].join('.')

export const releaseType = (version: string): ReleaseType =>
    Number(minorVersion(version)) % 2 === 1 ? 'insiders' : 'stable'

export const releaseNotesURL = (version: string): string =>
    releaseType(version) === 'stable'
        ? `https://github.com/sourcegraph/cody/releases/tag/vscode-v${version}`
        : 'https://github.com/sourcegraph/cody/blob/main/vscode/CHANGELOG.md'
