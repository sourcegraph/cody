import { execSync } from 'node:child_process'
import fs from 'node:fs'
import semver from 'semver'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const changelogFile = fs.readFileSync('CHANGELOG.md', 'utf8')
const releaseType = (process.env.RELEASE_TYPE || '').toLowerCase() as semver.ReleaseType

try {
    const currentVersion = packageJson.version

    if (!['minor', 'patch'].includes(releaseType)) {
        throw new Error(`Release type is invalid: ${releaseType}`)
    }

    console.log(`Current version: ${currentVersion}`)

    // Increase minor version number by twice for minor release because ODD minor number is for pre-release
    const isPatchRelease = releaseType === 'patch'
    const nextVersion = isPatchRelease
        ? semver.inc(currentVersion, releaseType)!
        : semver.inc(semver.inc(currentVersion, releaseType)!, releaseType)!

    if (!nextVersion) {
        throw new Error('Version number is invalid.')
    }

    console.log(`Next version: ${nextVersion}`)

    // Update version number in package.json
    packageJson.version = nextVersion
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2))

    // Update version number in Changelog
    const template = '## [Unreleased]\n\n### Added\n\n### Fixed\n\n### Changed\n\n## $VERSION'
    const updatedChangelogFile = changelogFile.replace(
        '## [Unreleased]',
        template.replace('$VERSION', nextVersion)
    )
    fs.writeFileSync('CHANGELOG.md', updatedChangelogFile)

    // Commit and push
    execSync(
        `git add . && git commit -m "VS Code: Release v${nextVersion}" && git push -u origin HEAD`,
        {
            stdio: 'inherit',
        }
    )

    console.log(`Version bumped to ${nextVersion} successfully!`)
} catch (error) {
    // Revert changes if an error occurred
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2))
    fs.writeFileSync('CHANGELOG.md', changelogFile)
}
