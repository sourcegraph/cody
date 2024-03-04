import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

import { getContextRange } from '../../../doc-context-getters'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { baseLanguageId } from '../../utils'
import { type DocumentHistory, VSCodeDocumentHistory } from './history'

import { lastNLines } from '../../../text-processing'
import { type JaccardMatch, bestJaccardMatches } from './bestJaccardMatch'

/**
 * The size of the Jaccard distance match window in number of lines. It determines how many
 * lines of the 'matchText' are considered at once when searching for a segment
 * that is most similar to the 'targetText'. In essence, it sets the maximum number
 * of lines that the best match can be. A larger 'windowSize' means larger potential matches
 */
const SNIPPET_WINDOW_SIZE = 50

/**
 * Limits the number of jaccard windows that are fetched for a single file. This is mostly added to
 * avoid large files taking up too much compute time and to avoid a single file to take up too much
 * of the whole context window.
 */
const MAX_MATCHES_PER_FILE = 20

/**
 * The Jaccard Similarity Retriever is a sparse, local-only, retrieval strategy that uses local
 * editor content (open tabs and file history) to find relevant code snippets based on the current
 * editor prefix.
 */
export class JaccardSimilarityRetriever implements ContextRetriever {
    constructor(
        private snippetWindowSize: number = SNIPPET_WINDOW_SIZE,
        private maxMatchesPerFile: number = MAX_MATCHES_PER_FILE
    ) {}

    public identifier = 'jaccard-similarity'
    private history = new VSCodeDocumentHistory()

    public async retrieve({
        document,
        docContext,
        abortSignal,
    }: ContextRetrieverOptions): Promise<JaccardMatchWithFilename[]> {
        const targetText = lastNLines(docContext.prefix, this.snippetWindowSize)
        const files = await getRelevantFiles(document, this.history)

        const contextRange = getContextRange(document, docContext)
        const contextLineRange = { start: contextRange.start.line, end: contextRange.end.line }

        const matches: JaccardMatchWithFilename[] = []
        for (const { uri, contents } of files) {
            if (abortSignal?.aborted) {
                continue
            }
            const fileMatches = bestJaccardMatches(
                targetText,
                contents,
                this.snippetWindowSize,
                this.maxMatchesPerFile
            )

            // Ignore matches with 0 overlap to our source file
            const relatedMatches = fileMatches.filter(match => match.score > 0)

            for (const match of relatedMatches) {
                if (
                    uri.toString() === document.uri.toString() &&
                    startOrEndOverlapsLineRange(
                        uri,
                        { start: match.startLine, end: match.endLine },
                        document.uri,
                        contextLineRange
                    )
                ) {
                    continue
                }

                matches.push({ ...match, uri })
            }
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
        // Only add files and VSCode user settings.
        if (!['file', 'vscode-userdata'].includes(document.uri.scheme)) {
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

/**
 * @returns true if range A overlaps range B
 */
function startOrEndOverlapsLineRange(
    uriA: vscode.Uri,
    lineRangeA: { start: number; end: number },
    uriB: vscode.Uri,
    lineRangeB: { start: number; end: number }
): boolean {
    if (uriA.toString() !== uriB.toString()) {
        return false
    }
    return (
        (lineRangeA.start >= lineRangeB.start && lineRangeA.start <= lineRangeB.end) ||
        (lineRangeA.end >= lineRangeB.start && lineRangeA.end <= lineRangeB.end)
    )
}
