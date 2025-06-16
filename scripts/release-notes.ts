import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { Anthropic } from '@anthropic-ai/sdk'
import dedent from 'dedent'

/**
 * A script to create GitHub release notes from the current
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

type IdeType = 'vscode' | 'jb' | 'web'

function buildGitTag(ideType: IdeType, version: string): string {
    return `${ideType}-v${version}`
}

function findPreviousReleaseTag(ideType: IdeType, currentTag: string): string {
    try {
        const tagPrefix = `${ideType}-v`
        const tags = execSync(`git tag --list "${tagPrefix}*" --sort=-version:refname`, {
            encoding: 'utf-8',
        })
            .trim()
            .split('\n')
            .filter(tag => tag && !tag.includes('-nightly'))

        const currentIndex = tags.indexOf(currentTag)
        if (currentIndex === -1) {
            throw new Error(`Current tag ${currentTag} not found in git tags`)
        }

        const previousTag = tags[currentIndex + 1]
        if (!previousTag) {
            throw new Error(`No previous tag found for ${currentTag}`)
        }

        return previousTag
    } catch (error) {
        throw new Error(`Failed to find previous release tag: ${error}`)
    }
}

function getCommitChangedFiles(commitHash: string): string[] {
    try {
        const output = execSync(`git show --name-only --pretty=format: ${commitHash}`, {
            encoding: 'utf-8',
        }).trim()
        return output.split('\n').filter(file => file?.trim())
    } catch (error) {
        console.warn(`Could not get files for commit ${commitHash}: ${error}`)
        return []
    }
}

function shouldExcludeCommit(ideType: IdeType, changedFiles: string[]): boolean {
    if (changedFiles.length === 0) {
        // If we can't determine changed files, include the commit to be safe
        return false
    }

    const hasWebChanges = changedFiles.some(file => file.startsWith('web/'))
    const hasJetBrainsChanges = changedFiles.some(file => file.startsWith('jetbrains/'))
    const hasAgentChanges = changedFiles.some(file => file.startsWith('agent/'))
    const hasOtherChanges = changedFiles.some(
        file => !file.startsWith('web/') && !file.startsWith('jetbrains/') && !file.startsWith('agent/')
    )

    if (ideType === 'jb') {
        // Exclude commits that only changed web directory
        return hasWebChanges && !hasJetBrainsChanges && !hasAgentChanges && !hasOtherChanges
    }
    if (ideType === 'web') {
        // Exclude commits that only changed jetbrains directory
        return hasJetBrainsChanges && !hasWebChanges && !hasAgentChanges && !hasOtherChanges
    }
    if (ideType === 'vscode') {
        // Exclude commits that only changed web, jetbrains, or agent directories
        return (hasWebChanges || hasJetBrainsChanges || hasAgentChanges) && !hasOtherChanges
    }

    return false
}

function extractLatestChangelogFromGit(
    currentTag: string,
    previousTag: string,
    ideType: IdeType
): { content: string; previousVersion: string } {
    try {
        // Extract version from previous tag (remove prefix like "vscode-v" or "jb-v")
        const previousVersion = previousTag.replace(/^.+-v/, '')

        // Get commit messages between tags
        const gitLog = execSync(`git log ${previousTag}..${currentTag} --oneline --no-merges`, {
            encoding: 'utf-8',
        }).trim()

        if (!gitLog) {
            return { content: 'No changes found.', previousVersion }
        }

        // Filter commits based on IDE type and changed files
        const commits = gitLog
            .split('\n')
            .map(line => {
                const [hash, ...messageParts] = line.split(' ')
                const message = messageParts.join(' ')
                return { hash, message }
            })
            .filter(({ hash }) => {
                const changedFiles = getCommitChangedFiles(hash)
                const shouldExclude = shouldExcludeCommit(ideType, changedFiles)
                if (shouldExclude) {
                    console.log(`Excluding commit ${hash}: only affects filtered directories`)
                }
                return !shouldExclude
            })
            .map(({ hash, message }) => `- ${message} (${hash})`)

        const content = `## Changes from ${previousTag} to ${currentTag}\n\n${commits.join('\n')}`

        return { content, previousVersion }
    } catch (error) {
        throw new Error(`Failed to extract changelog from git: ${error}`)
    }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2)
    if (args.length !== 2) {
        console.error('Usage: node release-notes.ts <repo-type> <version>')
        console.error('Example: node release-notes.ts vscode 1.94.0')
        process.exit(1)
    }

    const [ideType, version] = args
    if (ideType !== 'vscode' && ideType !== 'jb' && ideType !== 'web') {
        console.error('Repo type must be either "vscode", "jb", or "web"')
        process.exit(1)
    }

    console.log(`Writing release notes for ${ideType} v${version}...`)

    const currentTag = buildGitTag(ideType as IdeType, version)
    const previousTag = findPreviousReleaseTag(ideType as IdeType, currentTag)

    console.log(`Extracting changes between ${previousTag} and ${currentTag}...`)

    const { content, previousVersion } = extractLatestChangelogFromGit(
        currentTag,
        previousTag,
        ideType as IdeType
    )
    const summary = await summarizeChangelog(content)
    const minor = version.split('.').slice(1, 2).join('.')
    const previousMinor = extractPreviousMinor(minor)

    const intro = dedent`
    ✨ For the full technical changelog, see [What’s new in v${version}](https://github.com/sourcegraph/cody/blob/main/vscode/CHANGELOG.md) since v${previousVersion} ✨

    ${summary instanceof Error ? '' : `${summary}`}
    `

    let output = `${intro}\n\n`

    const outro = dedent`
      **Full Comparison**: https://github.com/sourcegraph/cody/compare/M${previousMinor}...M${minor}
    `
    output += `\n${outro}\n`
    console.log('\n=== Preview of Release Notes ===\n')
    console.log(output)
    console.log('\n==============================\n')
    // this is saved in the runner's local file system to be used in the release notes
    await fs.promises.writeFile(path.join(__dirname, '../RELEASE_NOTES.md'), output)
}

main().catch(console.error)

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
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            max_tokens: 5000,
        })
        const message = response.content[0]
        const text = (message as Anthropic.TextBlock).text
        // Extract content between release notes tags
        const releaseNotesMatch = text.match(/<release_notes>([\s\S]*)<\/release_notes>/)
        if (releaseNotesMatch) {
            return releaseNotesMatch[1].trim()
        }
    } catch (error) {
        console.log(`Error summarizing changelog: ${prompt}`, error)

        return new Error(`No release notes found in the response: ${error}`)
    }

    return new Error('Error summarizing changelog')
}
