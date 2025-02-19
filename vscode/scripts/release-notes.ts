/**
 * A script to create the GitHub release changelog format from the current
 * CHANGELOG.md.
 *
 * Example:
 *
 * ✨ For the full technical changelog, see [What’s new in v1.70.1](https://github.com/sourcegraph/cody/blob/main/vscode/CHANGELOG.md) since v1.70.0 ✨
 *
 * This minor update addresses a specific issue with the agentic chat functionality.
 *
 * 🐛 Bug Fixes
 * - Fixed an issue where terminal and openCtx tools were not properly registered in agentic chat [#7132](https://github.com/sourcegraph/cody/pull/7132)
 *
 * **Full Comparison**: https://github.com/sourcegraph/cody/compare/M68...M70
 */

import fs from 'node:fs'
import path from 'node:path'

import dedent from 'dedent'
import { Anthropic } from '@anthropic-ai/sdk'


interface Change {
    text: string
    link?: string
}

// Given a section in the changelog that looks like this:
//
// some other content...
// ## 1.0.2
//
// ### Added
//
// ### Fixed
//
// - Chat: Honor the cody.codebase setting for manually setting the remote codebase context. [pulls/2415](https://github.com/sourcegraph/cody/pull/2415)
//
// ### Changed
//
// ## 1.0.1
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
                const versionMatches = /^## (?<dottedVersion>\d+\.\d+\.\d+)$/.exec(line)                
                console.log(versionMatches)
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
        } else if (line.startsWith(`## ${version}`)) {
            found = true
        }
    }

    return { changes, previousVersion }
}

async function main(): Promise<void> {
    let output = ''

    const packageJSONPath = path.join(__dirname, '../package.json')
    const packageJSONBody = await fs.promises.readFile(packageJSONPath, 'utf-8')
    const packageJSON = JSON.parse(packageJSONBody)
    const currentVersion: string = packageJSON.version

    const changelogPath = path.join(__dirname, '../CHANGELOG.md')
    const changelogBody = await fs.promises.readFile(changelogPath, 'utf-8')

    const { previousVersion } = extractSection(changelogBody, currentVersion)
    const latestChangelog = extractLatestChangelog(changelogBody, previousVersion, currentVersion)
    let summary = await summarizeChangelog(latestChangelog)
    const minor = currentVersion.split('.').slice(1, 2).join('.')
    const previousMinor = extractPreviousMinor(minor)

    const intro = dedent`
    ✨ For the full technical changelog, see [What’s new in v${currentVersion}](https://github.com/sourcegraph/cody/blob/main/vscode/CHANGELOG.md) since v${previousVersion} ✨

    ${summary instanceof Error ? "" : `${summary}`}
    `

    output += `${intro}\n\n`

    const outro = dedent`
      **Full Comparison**: https://github.com/sourcegraph/cody/compare/M${previousMinor}...M${minor}
    `
    output += `\n${outro}\n`
    console.log(`----------
        ${output}
        `)
    await fs.promises.writeFile(path.join(__dirname, '../GITHUB_CHANGELOG.md'), output)
}

main().catch(console.error)

function extractLatestChangelog(changelog: string, previousVersion: string, currentVersion: string): string {
    const lines = changelog.split('\n')
    const changes = []
    let found = false
    for (const line of lines) {
        if (found) {
            if (line.startsWith(`## ${previousVersion}`)) {
                break
            }
            changes.push(line)
        } else if (line.startsWith(`## ${currentVersion}`)) {
            changes.push(line)
            found = true
        }
    }
    return changes.join('\n')
}

function extractPreviousMinor(minor: string): string {
    return `${Number.parseInt(minor) - 2}`
}

async function summarizeChangelog(changelog: string): Promise<string | Error> {
    
    const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const prompt = `
    You are tasked with summarizing a changelog into concise and informative release notes. The changelog will be provided to you, and your job is to distill the information into a clear, user-friendly format.

    Here is the changelog to summarize:

    <changelog>
    {{${changelog}}}
    </changelog>

    Your task is to create release notes that highlight the most important changes, new features, and fixes from this changelog.

    Follow these guidelines:

        1. Structure your release notes as follows:
        a. A brief introduction summarizing the overall update, you do not need to mention the version as a top header
        b. New Features (if any)
        c. Improvements
        d. Bug Fixes
        e. Any other relevant categories (e.g., Performance, Security)

        2. For each category:
        - List the most significant changes
        - Use bullet points for easy readability
        - Keep descriptions concise but informative
        - Focus on the impact to the user rather than technical details
        - Include the PR number and the link to the PR in the release notes
        - Add relevant emojis to each category header as you see fit to make it more aesthetic

        3. Prioritize information:
        - Highlight major new features or significant changes
        - Include critical bug fixes
        - Omit minor or technical changes that don't directly impact users

        4. Use clear, non-technical language that is easy for end-users to understand

        5. If there are numerous items in a category, select the top 3-5 most important ones

    Write your release notes inside <release_notes> tags. Begin with a brief introduction followed by the summarized release notes.
    `
    try {
        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            temperature: 0,
            messages: [{
                role: 'user',
                content: prompt
            }],
            max_tokens: 5000,
        })
        const message = response.content[0]
        const text = (message as Anthropic.TextBlock).text;
        // Extract content between release notes tags
        const releaseNotesMatch = text.match(/<release_notes>([\s\S]*)<\/release_notes>/)
        if (releaseNotesMatch) {
            return releaseNotesMatch[1].trim()
        }
    } catch (error) {
        console.log("Error summarizing changelog:", error)
        return new Error(`No release notes found in the response: ${error}`)
    }

    return new Error("Error summarizing changelog")
}
