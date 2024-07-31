import type {
    ItemsParams,
    ItemsResult,
    MentionsParams,
    MentionsResult,
    MetaResult,
    Provider,
} from '@openctx/client'
import {
    type FileURI,
    assertFileURI,
    displayPathBasename,
    isDefined,
    isFileURI,
    logDebug,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { lines } from '../../completions/text-processing'

interface Settings {
    cwd?: string
}

export const gitMentionsProvider: Provider<Settings> = {
    meta(): MetaResult {
        return { name: 'Git', mentions: {} }
    },

    async mentions(params: MentionsParams, settings: Settings): Promise<MentionsResult> {
        const dirsWithInfo = await getGitInfoForMentions(settings)
        const multipleDirs = dirsWithInfo.length >= 2
        return dirsWithInfo
            .flatMap(({ cwd, defaultBranch }) => {
                const dirSuffix = multipleDirs ? ` (${displayPathBasename(cwd)})` : ''
                return [
                    {
                        title: `Diff vs. ${defaultBranch}${dirSuffix}`,
                        description: 'Unmerged changes (diffs and commit messages)',
                        uri: createMentionURI({
                            cwdURI: cwd.toString(),
                            type: 'diff-vs-default-branch',
                            defaultBranch: defaultBranch,
                        }).toString(),
                    },
                    {
                        title: 'Uncommitted changes',
                        description: 'Diff vs. HEAD',
                        uri: createMentionURI({
                            cwdURI: cwd.toString(),
                            type: 'uncommitted-changes',
                        }).toString(),
                    },
                ]
            })
            .filter(mention => mention.title.toLowerCase().includes(params.query?.toLowerCase() ?? ''))
    },

    async items(params: ItemsParams): Promise<ItemsResult> {
        const mention = params.mention
        if (!mention) {
            return []
        }

        const data = parseMentionURI(mention.uri)
        if (!data) {
            return []
        }

        const cwd = URI.parse(data.cwdURI)
        if (!isFileURI(cwd)) {
            return []
        }

        switch (data.type) {
            case 'diff-vs-default-branch': {
                if (!data.defaultBranch) {
                    throw new Error('missing data.ref')
                }
                const { stdout: diff } = await execFileAsync(
                    'git',
                    ['diff', ...DIFF_ARGS, `${data.defaultBranch}...HEAD`, '--'],
                    {
                        cwd: cwd.fsPath,
                    }
                )
                const { stdout: commits } = await execFileAsync(
                    'git',
                    ['log', '--pretty=format:%B---', `${data.defaultBranch}..HEAD`, '--'],
                    {
                        cwd: cwd.fsPath,
                    }
                )
                return [
                    {
                        title: `Diff vs. ${data.defaultBranch}`,
                        ai: {
                            content: `Here are the unmerged changes (the git diff vs. the default branch):\n\n${omitDiffAtAtLines(
                                diff
                            )}`,
                        },
                    },
                    {
                        title: `Commit log vs. ${data.defaultBranch}`,
                        ai: {
                            content: `Here are the commit messages vs. the default branch:\n\n${commits}`,
                        },
                    },
                ]
            }
            case 'uncommitted-changes': {
                const { stdout: diff } = await execFileAsync(
                    'git',
                    ['diff', ...DIFF_ARGS, 'HEAD', '--'],
                    {
                        cwd: cwd.fsPath,
                    }
                )
                return [
                    {
                        title: mention.title,
                        ai: {
                            content: `${mention.title}:\n\n${omitDiffAtAtLines(diff)}`,
                        },
                    },
                ]
            }
        }
    },
}

const DIFF_ARGS = [
    '-w', // ignore whitespace
    '--no-prefix', // no 'a/' and 'b/' prefixes
    '--word-diff=plain',
    '--color=never',
    '--diff-algorithm=minimal',
]

function omitDiffAtAtLines(diff: string): string {
    // NOTE(sqs): I suspect that the lines like `@@ -27,11 +27,14 @@` are not helpful to the LLM.
    return lines(diff)
        .filter(line => !line.startsWith('@@ '))
        .join('\n')
}

async function getGitInfoForMentions(
    settings: Pick<Settings, 'cwd'>
): Promise<{ cwd: FileURI; defaultBranch: string }[]> {
    const dirs: FileURI[] | undefined = settings.cwd
        ? [assertFileURI(vscode.Uri.file(settings.cwd))]
        : vscode.workspace.workspaceFolders?.map(f => f.uri).filter(isFileURI)
    return (
        await Promise.all(
            dirs?.map(async dir => {
                try {
                    const { stdout: defaultBranch } = await execFileAsync(
                        'git',
                        ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
                        {
                            cwd: dir.fsPath,
                        }
                    )
                    return { cwd: dir, defaultBranch: defaultBranch.trim() }
                } catch (error) {
                    logDebug('gitMentionsProvider', 'getGitInfoForMentions', {
                        dir: dir.toString(),
                        error,
                    })
                    return null
                }
            }) ?? []
        )
    ).filter(isDefined)
}

interface MentionURIData {
    cwdURI: string
    type: 'diff-vs-default-branch' | 'uncommitted-changes'
    defaultBranch?: string
}

const URI_PREFIX = 'openctx://@sourcegraph/git-provider'

function createMentionURI(data: MentionURIData): URL {
    const url = new URL(URI_PREFIX)
    url.searchParams.set('data', JSON.stringify(data))
    return url
}

function parseMentionURI(uri: string): MentionURIData | null {
    try {
        const url = new URL(uri)

        // Check that `uri` matches the `URI_PREFIX`.
        const baseURL = new URL(URI_PREFIX)
        if (
            url.protocol !== baseURL.protocol ||
            url.host !== baseURL.host ||
            url.pathname !== baseURL.pathname
        ) {
            throw new Error('invalid base URL')
        }

        const data = JSON.parse(url.searchParams.get('data') ?? '') as MentionURIData
        if (!data || typeof data !== 'object' || !('cwdURI' in data) || !('type' in data)) {
            throw new Error('invalid format')
        }
        return data
    } catch (error) {
        logDebug('gitMentionsProvider', 'invalid Git mention URI', uri.toString(), error)
        return null
    }
}

async function execFileAsync(
    program: string,
    args: string[],
    { cwd }: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
    const { promisify } = await import('node:util')
    const { execFile } = await import('node:child_process')
    return promisify(execFile)(program, args, { cwd })
}
