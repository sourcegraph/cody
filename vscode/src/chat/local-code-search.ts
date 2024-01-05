import * as path from 'path'

import * as vscode from 'vscode'

import { getFileExtension } from '@sourcegraph/cody-shared/src/chat/recipes/helpers'
import { Recipe, RecipeContext, RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { Interaction } from '@sourcegraph/cody-shared/src/chat/transcript/interaction'
import { IndexedKeywordContextFetcher, Result } from '@sourcegraph/cody-shared/src/local-context'
import { MAX_HUMAN_INPUT_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'
import { truncateText } from '@sourcegraph/cody-shared/src/prompt/truncation'

import { getEditor } from '../editor/active-editor'

/**
 * Uses symf to run an LLM-enhanced indexed keyword search for the user's query
 */
export class LocalIndexedKeywordSearch implements Recipe {
    public id: RecipeID = 'local-indexed-keyword-search'
    public title = 'Local indexed keyword search'

    public async getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        const { symf } = context.codebaseContext
        if (!symf) {
            return new Interaction(
                {
                    speaker: 'human',
                    text: '',
                    displayText: humanChatInput,
                },
                {
                    speaker: 'assistant',
                    text: '',
                    displayText: 'symf not found',
                },
                Promise.resolve([]),
                []
            )
        }

        const query = humanChatInput || (await context.editor.showInputBox('Enter your search query here...')) || ''
        if (!query) {
            return null
        }
        const strippedQuery = query.replace(/^\s*\/symf(?:\s+|$)/, '').trim()
        if (strippedQuery.length === 0) {
            return new Interaction(
                {
                    speaker: 'human',
                    text: '',
                    displayText: humanChatInput,
                },
                {
                    speaker: 'assistant',
                    text: '',
                    displayText: 'Enter a query after "/symf"',
                },
                new Promise(resolve => resolve([])),
                []
            )
        }

        const truncatedText = truncateText(strippedQuery, MAX_HUMAN_INPUT_TOKENS)
        return new Interaction(
            {
                speaker: 'human',
                text: '',
                displayText: query,
            },
            {
                speaker: 'assistant',
                text: '',
                displayText: await this.displaySearchResults(symf, truncatedText),
            },
            new Promise(resolve => resolve([])),
            []
        )
    }

    private async displaySearchResults(symf: IndexedKeywordContextFetcher, text: string): Promise<string> {
        const scopeDir = getCurrentWorkspaceRoot()
        if (!scopeDir) {
            return 'Open a workspace folder to determine the search scope'
        }

        const resultSets = await symf.getResults(text, [scopeDir])
        if (resultSets.length === 0) {
            return 'Open a workspace folder to determine the search scope'
        }
        const groupedResults = groupByFile(await resultSets[0])
        const resultsHTML = await htmlForResultGroups(groupedResults)
        return resultsHTML
    }
}

function firstNLines(text: string, n: number): string {
    const lines = text.split('\n')
    if (lines.length <= n) {
        return text
    }
    return lines.slice(0, n).join('\n')
}

function lastNComponents(path_: string, n: number): string {
    const components = path_.split(path.sep)
    if (components.length <= n) {
        return path_
    }
    return components.slice(components.length - n).join(path.sep)
}

function groupByFile(results: Result[]): { file: string; results: Result[] }[] {
    const groups: { file: string; results: Result[] }[] = []

    for (const result of results) {
        const group = groups.find(g => g.file === result.file)
        if (group) {
            group.results.push(result)
        } else {
            groups.push({
                file: result.file,
                results: [result],
            })
        }
    }
    return groups
}

async function htmlForResultGroups(groups: { file: string; results: Result[] }[]): Promise<string> {
    const groupHTMLsPromise = groups.map(async ({ file, results }) => {
        const doc = await vscode.workspace.openTextDocument(file)
        const extension = getFileExtension(file)
        const fileUri = vscode.Uri.file(file)
        const uri = vscode.Uri.parse(`vscode://file${fileUri.path}`).toString()

        const resultsHTML: string[] = []
        for (const result of results) {
            const text = doc.getText(
                doc.validateRange(
                    new vscode.Range(
                        result.range.startPoint.row,
                        result.range.startPoint.col,
                        result.range.endPoint.row,
                        result.range.endPoint.col
                    )
                )
            )
            resultsHTML.push(
                `<a style="display: block" href="${uri}:${result.range.startPoint.row + 1}:${
                    result.range.startPoint.col
                }:${result.range.endPoint.row}:${result.range.endPoint.col}">

\`\`\`${extension}
${firstNLines(text, 10)}
\`\`\`

</a>`
            )
        }
        const fileHeaderHTML = `<span class="display: block;"><a href="${uri}">${lastNComponents(file, 3)}</a></span>`
        return `<div class="search-chunk">${fileHeaderHTML}${resultsHTML.join('\n')}</div>`
    })
    const groupHTMLs = await Promise.all(groupHTMLsPromise)
    return groupHTMLs.join('\n')
}

function getCurrentWorkspaceRoot(): string | null {
    const uri = getEditor().active?.document?.uri
    if (uri) {
        const wsFolder = vscode.workspace.getWorkspaceFolder(uri)
        if (wsFolder) {
            return wsFolder.uri.fsPath
        }
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null
}
