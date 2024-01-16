import path from 'path'

import * as vscode from 'vscode'
import { type URI } from 'vscode-uri'

import { isCodyIgnoredFile } from '@sourcegraph/cody-shared/src/chat/context-filter'

import { type ContextRetriever, type ContextRetrieverOptions, type ContextSnippet } from '../../../types'
import { baseLanguageId } from '../../utils'

import { bestJaccardMatch, type JaccardMatch } from './bestJaccardMatch'
import { VSCodeDocumentHistory, type DocumentHistory } from './history'

/**
 * The size of the Jaccard distance match window in number of lines. It determines how many
 * lines of the 'matchText' are considered at once when searching for a segment
 * that is most similar to the 'targetText'. In essence, it sets the maximum number
 * of lines that the best match can be. A larger 'windowSize' means larger potential matches
 */
const SNIPPET_WINDOW_SIZE = 50

/**
 * The Jaccard Similarity Retriever is a sparse, local-only, retrieval strategy that uses local
 * editor content (open tabs and file history) to find relevant code snippets based on the current
 * editor prefix.
 */
export class JaccardSimilarityRetriever implements ContextRetriever {
    public identifier = 'jaccard-similarity'
    private history = new VSCodeDocumentHistory()

    public async retrieve({ document, docContext, abortSignal }: ContextRetrieverOptions): Promise<ContextSnippet[]> {
        const targetText = lastNLines(docContext.prefix, SNIPPET_WINDOW_SIZE)
        const files = await getRelevantFiles(document, this.history)

        const matches: JaccardMatchWithFilename[] = []
        for (const { uri, contents } of files) {
            const match = bestJaccardMatch(targetText, contents, SNIPPET_WINDOW_SIZE)
            if (!match || abortSignal?.aborted || isCodyIgnoredFile(uri)) {
                continue
            }

            matches.push({
                // Use relative path to remove redundant information from the prompts and
                // keep in sync with embeddings search results which use relative to repo root paths
                fileName: path.normalize(vscode.workspace.asRelativePath(uri.fsPath)),
                ...match,
                uri,
            })
        }

        matches.sort((a, b) => b.score - a.score)

        return matches
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    public dispose(): void {
        this.history.dispose()
    }
}

interface JaccardMatchWithFilename extends JaccardMatch {
    fileName: string
    uri: URI
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
        if (isCodyIgnoredFile(document.uri)) {
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
