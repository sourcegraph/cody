/**
 * A script to create the GitHub release changelog format from the current
 * CHANGELOG.md.
 *
 * Example:
 *
 * ✨ See the [What’s new in v0.18](https://about.sourcegraph.com/blog/cody-vscode-0-18-release) blog post for what’s new in this release since v0.16 ✨
 *
 * ## v0.18.6 Changes
 *
 * - Context: Incomplete embeddings indexing status can seen in the status bar. On macOS and Linux, indexing can be resumed by clicking there. However Windows users will still see an OS error 5 (access denied) when retrying indexing by @dominiccooney in https://github.com/sourcegraph/cody/pull/2265
 * - ...
 *
 * **Full Changelog**: https://github.com/sourcegraph/cody/compare/vscode-v0.18.5...vscode-v0.18.6
 */

import fs from 'fs'
import path from 'path'

import dedent from 'dedent'

interface Change {
    text: string
    link?: string
}

// Given a section in the changelog that looks like this:
//
// some other content...
// ## [1.0.2]
//
// ### Added
//
// ### Fixed
//
// - Chat: Honor the cody.codebase setting for manually setting the remote codebase context. [pulls/2415](https://github.com/sourcegraph/cody/pull/2415)
//
// ### Changed
//
// ## [1.0.1]
// some other content...
//
// Extract a list of changes and the previous version number
function extractSection(
    changelog: string,
    version: string
): { changes: Change[]; previousVersion: string } {
    let previousVersion = ''

    const lines = changelog.split('\n')
    const changes = []
    let found = false
    for (const line of lines) {
        if (found) {
            if (line.startsWith('## ')) {
                const versionMatches = /^## \[(?<dottedVersion>\d+\.\d+\.\d+)]$/.exec(line)
                if (!versionMatches?.groups) {
                    throw new Error(`Malformed version line: ${line}`)
                }
                previousVersion = versionMatches.groups?.dottedVersion
                break
            }

            if (line.startsWith('- ')) {
                const change = line.slice(2)

                const linkRegex = /\[(pull|pulls|issue|issues).*]\((?<link>.*)\)/
                const firstLink = linkRegex.exec(change)

                let text = change.slice(0, firstLink?.index ?? -1).trim()
                // Remove eventual trailing dot in the text
                if (text.endsWith('.')) {
                    text = text.slice(0, -1)
                }

                const link = firstLink?.groups?.link ?? undefined

                changes.push({ text, link })
            }
        } else if (line.startsWith(`## [${version}]`)) {
            found = true
        }
    }

    return { changes, previousVersion }
}

function extractRepoAndNumberFromLink(
    link: string
): { owner: string; repo: string; number: string } | undefined {
    const matches =
        /https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/(pull|issues)\/(?<number>\d+)/.exec(
            link
        )
    if (!matches?.groups) {
        throw new Error(`Malformed link: ${link}`)
    }
    return {
        owner: matches.groups.owner,
        repo: matches.groups.repo,
        number: matches.groups.number,
    }
}

async function main(): Promise<void> {
    let output = ''

    const packageJSONPath = path.join(__dirname, '../package.json')
    const packageJSONBody = await fs.promises.readFile(packageJSONPath, 'utf-8')
    const packageJSON = JSON.parse(packageJSONBody)
    const currentVersion: string = packageJSON.version

    const changelogPath = path.join(__dirname, '../CHANGELOG.md')
    const changelogBody = await fs.promises.readFile(changelogPath, 'utf-8')

    const { changes, previousVersion } = extractSection(changelogBody, currentVersion)

    const minor = currentVersion.split('.').slice(0, 2).join('.')
    const previousMinor = extractPreviousMinor(minor)

    const intro = dedent`
        ✨ See the [What’s new in v${minor}](https://about.sourcegraph.com/blog/cody-vscode-${minor.replaceAll(
            '.',
            '-'
        )}-0-release) blog post for what’s new in this release since v${previousMinor} ✨

        ## v${currentVersion} Changes
    `

    output += `${intro}\n\n`

    for (const change of changes) {
        let author: string | undefined
        if (change.link) {
            const data = extractRepoAndNumberFromLink(change.link)
            if (data) {
                const { owner, repo, number } = data

                const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`
                // @ts-ignore: Fetch is available in node :shrug:
                const json = await fetch(apiUrl).then(res => res.json())
                if (json?.user?.login) {
                    author = json.user.login
                }
            }
        }

        output += `- ${change.text}${author ? ` by @${author}` : ''}${
            change.link ? ` in ${change.link}` : ''
        }\n`
    }

    const outro = dedent`
      **Full Changelog**: https://github.com/sourcegraph/cody/compare/vscode-v${previousVersion}...vscode-v${currentVersion}
    `
    output += `\n${outro}\n`

    await fs.promises.writeFile(path.join(__dirname, '../GITHUB_CHANGELOG.md'), output)
}

main().catch(console.error)

function extractPreviousMinor(majorAndMinor: string): string {
    const [major, minor] = majorAndMinor.split('.')
    return `${major}.${parseInt(minor) - 1}`
}
