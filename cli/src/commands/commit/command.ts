import { spawn as _spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { cwd } from 'process'

import { Command } from 'commander'

import { Client, getClient } from '../../client'
import { getCompletionWithContext } from '../../client/completions'
import { createGitHelpers, GitHelpers } from '../../gitHelpers'
import { debugLog } from '../../log'
import { GlobalOptions } from '../../program'

const spawn = promisify(_spawn)

interface CommitOptions {
    diffFile?: string
    otherCommits: boolean
    dryRun: boolean
    all: boolean
}

export const commitCommand = new Command('commit')
    .description('Write a Git commit message.')
    .option('--diff-file <file>', 'Read the diff from a file (or /dev/stdin) instead of invoking `git diff`')
    .option('--other-commits', 'Include your recent commit messages as examples', true)
    .option('--dry-run', 'Show suggested message but do not invoke `git commit`', false)
    .option('-a, --all', 'Same as `git commit -a` flag', false)
    .action(async (options, program: Command) =>
        console.log(
            await run(
                options,
                {
                    cwd: cwd(),
                    gitHelpers: createGitHelpers(),
                    client: await getClient(program.optsWithGlobals<GlobalOptions>()),
                },
                program.optsWithGlobals<GlobalOptions>()
            )
        )
    )

interface CommitEnvironment {
    cwd: string
    gitHelpers: GitHelpers
    client: Client | GlobalOptions
}

export async function run(
    options: CommitOptions,
    { cwd, gitHelpers, client }: CommitEnvironment,
    globalOptions: Pick<GlobalOptions, 'debug'>
): Promise<string> {
    const diff = options.diffFile
        ? await fs.readFile(options.diffFile, 'utf8')
        : await gitHelpers.getDiffToCommit({ cwd, stagedOnly: !options.all })
    debugLog(globalOptions.debug, 'Diff', diff)

    const otherCommitMessages = options.otherCommits ? await gitHelpers.getOtherCommitMessages({ cwd }) : []
    debugLog(globalOptions.debug, 'Other commit messages', otherCommitMessages.join('\n--\n'))

    const commitMessage = await generateCommitMessage(diff, otherCommitMessages, globalOptions.debug, client)

    if (!options.dryRun) {
        // Run `git commit` with the commit message.
        const messageFile = path.join(await gitHelpers.gitDir({ cwd }), 'CODY_COMMIT_MSG')
        await fs.writeFile(messageFile, commitMessage, 'utf8')
        try {
            await spawn(
                'git',
                ['commit', options.all ? '--all' : null, `--file=${messageFile}`, '--edit'].filter(
                    (arg): arg is string => arg !== null
                ),
                {
                    cwd,
                    stdio: 'inherit',
                }
            )
        } finally {
            await fs.rm(messageFile, { force: true })
        }
    }

    return commitMessage
}

async function generateCommitMessage(
    diff: string,
    otherCommitMessages: string[],
    debug: boolean,
    client: Client | GlobalOptions
): Promise<string> {
    // Strip ' (#123)' pull request references from the other commit messages because they can
    // mislead the LLM.
    for (const [i, msg] of otherCommitMessages.entries()) {
        otherCommitMessages[i] = msg.replace(/^(.*)\s+\(#\d+\)(\n|$)/, '$1')
    }

    const humanMessage = [
        'A commit message consists of a short subject line and a body with additional details about and reasons for the change. Commit messages are concise, technical, and specific to the change. They also mention any UI or user-facing changes.',
        otherCommitMessages.length > 0
            ? `Here are some examples of good commit messages for other diffs:\n\n${otherCommitMessages
                  .map(m => `<commit-message>\n${m}\n</commit-message>`)
                  .join('\n\n')}`
            : null,
        `Here is a diff:\n\n<diff>\n${diff}\n</diff>`,
        'Write a commit message and body the diff.',
    ]
        .filter(s => s !== null)
        .join('\n\n')

    const completion = await getCompletionWithContext(
        client,
        humanMessage,
        'Here is a suggested commit message for the diff:\n\n<commit-message>',
        debug
    )
    const commitMessage = completion.slice(0, completion.indexOf('</commit-message>')).trim()
    return commitMessage
}
