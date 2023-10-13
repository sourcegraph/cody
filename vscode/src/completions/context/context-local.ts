import path from 'path'

import * as vscode from 'vscode'

import { isCodyIgnoredFile } from '@sourcegraph/cody-shared/src/chat/context-filter'

import { ContextSnippet } from '../types'

import { bestJaccardMatch, JaccardMatch } from './bestJaccardMatch'
import { DocumentHistory } from './history'
import { baseLanguageId } from './utils'

interface JaccardMatchWithFilename extends JaccardMatch {
    fileName: string
}

interface Options {
    document: vscode.TextDocument
    history: DocumentHistory
    prefix: string
    jaccardDistanceWindowSize: number
}

export async function getContextFromCurrentEditor(options: Options): Promise<ContextSnippet[]> {
    const { document, history, prefix, jaccardDistanceWindowSize } = options
    // Return early if current document is on the ignore list
    if (isCodyIgnoredFile(document.uri.fsPath)) {
        return []
    }

    const targetText = lastNLines(prefix, jaccardDistanceWindowSize)
    const files = await getRelevantFiles(document, history)

    const matches: JaccardMatchWithFilename[] = []
    for (const { uri, contents } of files) {
        // skip file that is on the ignore list
        if (isCodyIgnoredFile(uri.fsPath)) {
            continue
        }

        const match = bestJaccardMatch(targetText, contents, jaccardDistanceWindowSize)
        if (!match) {
            continue
        }

        matches.push({
            // Use relative path to remove redundant information from the prompts and
            // keep in sync with embeddings search resutls which use relatve to repo root paths.
            fileName: path.normalize(vscode.workspace.asRelativePath(uri.fsPath)),
            ...match,
        })
    }

    matches.sort((a, b) => b.score - a.score)

    return matches
}

interface FileContents {
    uri: vscode.Uri
    contents: string
}

/**
 * Loads all relevant files for for a given text editor. Relevant files are defined as:
 *
 * - All currently open tabs matching the same language
 * - The last 10 files that were edited matching the same language
 *
 * For every file, we will load up to 10.000 lines to avoid OOMing when working with very large
 * files.
 */
async function getRelevantFiles(
    currentDocument: vscode.TextDocument,
    history: DocumentHistory
): Promise<FileContents[]> {
    const files: FileContents[] = []

    const curLang = currentDocument.languageId
    if (!curLang) {
        return []
    }

    function addDocument(document: vscode.TextDocument): void {
        if (document.uri.toString() === currentDocument.uri.toString()) {
            // omit current file
            return
        }

        // Only add files and VSCode user settings.
        if (!['file', 'vscode-userdata'].includes(document.uri.scheme)) {
            return
        }

        // Do not add files that are on the codyignore list
        if (isCodyIgnoredFile(document.uri.fsPath)) {
            return
        }

        if (baseLanguageId(document.languageId) !== baseLanguageId(curLang)) {
            return
        }

        // TODO(philipp-spiess): Find out if we have a better approach to truncate very large files.
        const endLine = Math.min(document.lineCount, 10_000)
        const range = new vscode.Range(0, 0, endLine, 0)

        files.push({
            uri: document.uri,
            contents: document.getText(range),
        })
    }

    const visibleUris = vscode.window.visibleTextEditors.flatMap(e =>
        e.document.uri.scheme === 'file' ? [e.document.uri] : []
    )

    // Use tabs API to get current docs instead of `vscode.workspace.textDocuments`.
    // See related discussion: https://github.com/microsoft/vscode/issues/15178
    // See more info about the API: https://code.visualstudio.com/api/references/vscode-api#Tab
    const allUris: vscode.Uri[] = vscode.window.tabGroups.all
        .flatMap(({ tabs }) => tabs.map(tab => (tab.input as any)?.uri))
        .filter(Boolean)

    // To define an upper-bound for the number of files to take into consideration, we consider all
    // active editor tabs and the 5 tabs (7 when there are no split views) that are open around it
    // (so we include 2 or 3 tabs to the left to the right).
    //
    // TODO(philipp-spiess): Consider files that are in the same directory or called similarly to be
    // more relevant.
    const uris: Map<string, vscode.Uri> = new Map()
    const surroundingTabs = visibleUris.length <= 1 ? 3 : 2
    for (const visibleUri of visibleUris) {
        uris.set(visibleUri.toString(), visibleUri)
        const index = allUris.findIndex(uri => uri.toString() === visibleUri.toString())

        if (index === -1) {
            continue
        }

        const start = Math.max(index - surroundingTabs, 0)
        const end = Math.min(index + surroundingTabs, allUris.length - 1)

        for (let j = start; j <= end; j++) {
            uris.set(allUris[j].toString(), allUris[j])
        }
    }

    const docs = (
        await Promise.all(
            [...uris.values()].map(async uri => {
                if (!uri) {
                    return []
                }

                try {
                    return [await vscode.workspace.openTextDocument(uri)]
                } catch (error) {
                    console.error(error)
                    return []
                }
            })
        )
    ).flat()

    for (const document of docs) {
        if (document.fileName.endsWith('.git')) {
            // The VS Code API returns fils with the .git suffix for every open file
            continue
        }
        addDocument(document)
    }

    await Promise.all(
        history.lastN(10, curLang, [currentDocument.uri, ...files.map(f => f.uri)]).map(async item => {
            try {
                const document = await vscode.workspace.openTextDocument(item.document.uri)
                addDocument(document)
            } catch (error) {
                console.error(error)
            }
        })
    )
    return files
}

function lastNLines(text: string, n: number): string {
    const lines = text.split('\n')
    return lines.slice(Math.max(0, lines.length - n)).join('\n')
}
