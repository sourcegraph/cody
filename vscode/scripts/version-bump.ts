import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
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

if (!isPatchRelease) {
    generateChangelog()
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

function run(command: string, env: NodeJS.ProcessEnv = {}): string {
    console.log(`+ ${command}`)
    try {
        return String(execSync(command, { env: { ...process.env, ...env } })).trim()
    } catch (error) {
        if (error instanceof Error && 'stderr' in error) {
            console.error(`Error executing command: ${command}`)
            console.error(`stderr: ${error.stderr}`)
        } else {
            console.error(`Error executing command: ${command}`)
            console.error(error)
        }
        process.exit(1)
    }
}

function generateChangelog() {
    const devxServiceDir = process.env.DEVX_SERVICE_DIR ?? '../../devx-service'
    const changelogTag = 'jsm/cody-changelog'

    const hasBazel = run('which bazel')
    if (!hasBazel) {
        console.error(
            'bazel is not installed. Please install it with `brew install bazelisk` to get changelog generation'
        )
        return
    }
    if (!process.env.GH_TOKEN) {
        console.error(
            'GH_TOKEN is not set. Please set it to a GitHub token with read access to the repo in order to generate the changelog.'
        )
        return
    }

    // clone the devx-service repo into devxServiceDir if it doesn't already exist
    if (!fs.existsSync(devxServiceDir)) {
        console.log(`Cloning devx-service repository into ${devxServiceDir}...`)
        execSync(`git clone https://github.com/sourcegraph/devx-service.git ${devxServiceDir}`, {
            stdio: 'inherit',
        })
    }
    // Change directory to devxServiceDir
    const cwd = process.cwd()
    process.chdir(devxServiceDir)
    // Checkout the working changelog tag
    if (!process.env.SKIP_CHANGELOG_CHECKOUT) {
        run(`git checkout ${changelogTag}`)
    }
    execSync('bazel build //cmd/changelog:changelog')

    // Get the location of the changelog binary using bazel
    const CHANGELOG_BIN = path.join(devxServiceDir, run('bazel cquery //cmd/changelog --output=files'))
    process.chdir(cwd)

    const lastRelease = `vscode-v${version}`

    // Get the git commit associated with the lastRelease tag
    const lastReleaseCommit = run(`git rev-parse ${lastRelease}`)
    const headCommit = run('git rev-parse HEAD')

    if (!lastReleaseCommit) {
        console.error(`Failed to find commit for tag: ${lastRelease}`)
        return
    }
    const env = {
        RELEASE_LATEST_COMMIT: headCommit,
        RELEASE_LATEST_RELEASE: lastReleaseCommit,
        GH_REPO: 'sourcegraph/cody',
        CHANGELOG_CATEGORY_ACCEPTLIST: 'added,changed,fixed',
        CHANGELOG_SKIP_NO_CHANGELOG: 'true',
        CHANGELOG_COMPACT: 'true',
        OUTPUT_FILE: 'changelog_experimental.md',
        RELEASE_REGISTRY_VERSION: '1.0.0',
    }

    run(`${CHANGELOG_BIN} write`, env)
}
