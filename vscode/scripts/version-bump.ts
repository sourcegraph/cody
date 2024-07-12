import { execSync } from 'node:child_process'
import fs from 'node:fs'
import semver from 'semver'
import { version } from '../package.json'

/*
 * This script is used to bump the version of the extension in package.json and update the CHANGELOG.md file.

 * It can be run with the following command:
 *  pnpm run version-bump:minor for a minor version bump
 *  pnpm run version-bump:dry-run for testing the script without committing the changes
 */

// Execute a command to create a new branch off origin/main
execSync('git checkout main && git pull origin main', { stdio: 'inherit' })

const releaseType = (process.env.RELEASE_TYPE || '').toLowerCase() as semver.ReleaseType
const isDryRun = releaseType === 'prerelease'

const isValidReleaseType = ['minor', 'patch', 'prerelease'].includes(releaseType)
if (!isDryRun && !isValidReleaseType) {
    process.stdout.write(`Invalid release type: ${releaseType}. Valid types: minor, patch, prerelease\n`)
    process.exit(1)
}

process.stdout.write(`Starting version bump from ${version} for ${releaseType} release...\n`)

const nextInsiderVersion = semver.inc(version, releaseType)!
const isPatchRelease = releaseType === 'patch' || isDryRun

// Increase minor version number twice for minor release as ODD minor number is reserved for pre-releases.
const nextVersion = isPatchRelease ? nextInsiderVersion : semver.inc(nextInsiderVersion, releaseType)!

if (!nextVersion || !semver.valid(nextVersion)) {
    process.stdout.write(
        `Failed to compute the next version number for ${version} and ${releaseType}.\n`
    )
    process.exit(1)
}

execSync(`git checkout -b release-${releaseType}-v${nextVersion}`, { stdio: 'inherit' })

process.stdout.write(`Updating files to the next version: ${nextVersion}\n`)

const template = '## [Unreleased]\n\n### Added\n\n### Fixed\n\n### Changed\n\n## $VERSION'

updateFile('CHANGELOG.md', '## [Unreleased]', template.replace('$VERSION', nextVersion))
updateFile('package.json', `"version": "${version}"`, `"version": "${nextVersion}"`)

process.stdout.write(`Version bumped to ${nextVersion} successfully!`)

if (isDryRun) {
    process.stdout.write('\nDry run completed. Showing the diff...\n\n')
    execSync('git diff', { stdio: 'inherit' })
    process.exit(0)
}

const ReleaseChecklistTemplate = `VS Code: Release v${nextVersion}

Release Checklist:

    - [x] [vscode/CHANGELOG.md](./CHANGELOG.md)
    - [x] [vscode/package.json](./package.json)
    - [ ] Link to PR for the release blog post
`

// Commit and push
const gitCommit = `git add . && git commit -m "${ReleaseChecklistTemplate}" && git push -u origin HEAD`
execSync(gitCommit, { stdio: 'inherit' })
process.stdout.write(`${releaseType} release job is done!`)

function updateFile(fileName: string, keyword: string, replacer: string) {
    const fileContent = fs.readFileSync(fileName, 'utf8')
    const updatedFile = fileContent.replace(keyword, replacer)

    fs.writeFileSync(fileName, updatedFile)
}
