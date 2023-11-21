import { execSync } from 'child_process'
import * as fspromises from 'fs/promises'
import * as path from 'path'

import parseGitDiff, { AddedLine } from 'parse-git-diff'
import * as vscode from 'vscode'

import { MessageHandler } from '../../jsonrpc-alias'
import { getLanguageForFileName } from '../../language'

import { AutocompleteDocument } from './AutocompleteDocument'
import { EvaluateAutocompleteOptions, matchesGlobPatterns } from './evaluate-autocomplete'
import { triggerAutocomplete } from './triggerAutocomplete'

export async function evaluateGitLogStrategy(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions,
    workspace: string
): Promise<void> {
    try {
        let remainingTests = options.testCount
        const commits = execSync(
            `git log --name-only --oneline --diff-filter=AMC --stat --numstat --pretty=format:'%H - %an, %ar : %s' -- ${options.gitLogFilter}`,
            { cwd: workspace }
        )
            .toString()
            .split('\n')
            .map(string => string.split(' ')[0])
            .slice(0, options.testCount)
            .filter(Boolean)
        // Reverse the commits list so the first element is the oldest commit
        commits.reverse()
        for (const commit of commits) {
            try {
                execSync(`git checkout ${commit}`, { cwd: workspace })

                const diff = execSync('git diff HEAD~1', { cwd: workspace }).toString()
                const parsedDiff = parseGitDiff(diff)

                let index = 0
                for (const file of parsedDiff.files) {
                    const filePath: string = file.type === 'RenamedFile' ? file.pathAfter : file.path

                    if (!matchesGlobPatterns(options.includeFilepath ?? [], options.excludeFilepath ?? [], filePath)) {
                        continue
                    }
                    const fullPath = path.join(workspace, filePath)
                    const content = (await fspromises.readFile(fullPath)).toString()
                    const languageid = getLanguageForFileName(filePath)
                    const document = new AutocompleteDocument(
                        {
                            languageid,
                            filepath: filePath,
                            fixture: options.fixture.name,
                            strategy: options.fixture.strategy,
                            workspace: path.basename(options.workspace),
                        },
                        content
                    )

                    const isLastFile = index === parsedDiff.files.length - 1

                    if (!isLastFile) {
                        // Open all files to simulate local editor context
                        // @TODO: Move the cursor into the changed sections
                        client.notify('textDocument/didOpen', { filePath, content })
                    }

                    if (isLastFile) {
                        const lastAddedLine = file.chunks
                            .flatMap(chunks => (chunks.type === 'BinaryFilesChunk' ? [] : chunks.changes))
                            .findLast(line => line.type === 'AddedLine' && line.content.trim().length >= 4) as
                            | AddedLine
                            | undefined

                        if (!lastAddedLine) {
                            continue
                        }

                        if (remainingTests <= 0) {
                            continue
                        }

                        const replaceContent = lastAddedLine.content.trimStart()

                        const range: vscode.Range = new vscode.Range(
                            lastAddedLine.lineAfter - 1,
                            lastAddedLine.content.length - replaceContent.length,
                            lastAddedLine.lineAfter - 1,
                            lastAddedLine.content.length
                        )
                        // TODO: This only allows single-lined completions
                        if (!range.isSingleLine) {
                            throw new Error('Multi-line ranges not supported yet')
                        }

                        const lines = document.text.split('\n')
                        const currentLine = lines[range.start.line]

                        const removedContent = currentLine.slice(range.start.character, range.end.character + 1)
                        const modifiedContent = [
                            ...lines.slice(0, range.start.line),
                            currentLine.slice(0, range.start.character) + currentLine.slice(range.end.character),
                            ...lines.slice(range.end.line + 1),
                        ].join('\n')
                        const position = range.start

                        await triggerAutocomplete({
                            removedContent,
                            modifiedContent,
                            position,
                            range,
                            client,
                            document,
                            emptyMatchContent: '',
                        })

                        if (options.snapshotDirectory) {
                            await document.writeSnapshot(options.snapshotDirectory)
                        }

                        remainingTests--
                    }

                    index++
                }
            } finally {
                // TODO: Reset all open editor tabs to avoid interference
            }
        }
    } finally {
        // Reset submodule to initial HEAD
        const submodulesDir = path.join(workspace, '..')
        execSync('git submodule deinit -f .', { cwd: submodulesDir }).toString()
        execSync('it submodule update --init', { cwd: submodulesDir }).toString()
    }
}
