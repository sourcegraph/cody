import path from 'path'

import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

import { PreciseContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'

import { GraphContextFetcher } from '../completions/context/context'
import { SymbolContextSnippet } from '../completions/types'
import { logDebug } from '../log'

import { getGraphContextFromRange as defaultGetGraphContextFromRange, locationKeyFn } from './graph'
import { getDocumentSections as defaultGetDocumentSections, DocumentSection } from './sections'

interface Section extends DocumentSection {
    context: {
        lastRevalidateAt: number
        isStale: boolean
        context: PreciseContext[] | null
    } | null
}

interface ActiveDocument {
    uri: string
    sections: Section[]
    lastRevalidateAt: number
    lastLines: number
}

const ONE_MINUTE = 60 * 1000
const TEN_MINUTES = 10 * ONE_MINUTE

const NUM_OF_CHANGED_LINES_FOR_SECTION_RELOAD = 3

const MAX_TRACKED_DOCUMENTS = 10

/**
 * Watches a document for changes and refreshes the sections if needed. Preloads the sections that
 * the document is being modified by intersecting the cursor position with the document sections.
 *
 * Each section will behave like a stale-while-revalidate cache in that it will serve the previous
 * context while it is still being revalidated.
 */
export class SectionObserver implements vscode.Disposable, GraphContextFetcher {
    private disposables: vscode.Disposable[] = []

    // A map of all active documents that are being tracked.
    private activeDocuments: LRUCache<string, ActiveDocument> = new LRUCache<string, ActiveDocument>({
        max: MAX_TRACKED_DOCUMENTS,
    })

    constructor(
        private window: Pick<
            typeof vscode.window,
            'onDidChangeVisibleTextEditors' | 'onDidChangeTextEditorSelection' | 'visibleTextEditors'
        > = vscode.window,
        workspace: Pick<typeof vscode.workspace, 'onDidChangeTextDocument'> = vscode.workspace,
        private getDocumentSections: typeof defaultGetDocumentSections = defaultGetDocumentSections,
        private getGraphContextFromRange: typeof defaultGetGraphContextFromRange = defaultGetGraphContextFromRange
    ) {
        this.disposables.push(window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors.bind(this)))
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
        this.disposables.push(window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection.bind(this)))
        void this.onDidChangeVisibleTextEditors()
    }

    public getContextAtPosition(document: vscode.TextDocument, position: vscode.Position): SymbolContextSnippet[] {
        const section = this.getSectionAtPosition(document, position)
        if (section?.context?.context) {
            return section.context.context.map(preciseContextToSnippet)
        }
        return []
    }

    private async hydrateContextAtCursor(editor: vscode.TextEditor, position: vscode.Position): Promise<void> {
        const section = this.getSectionAtPosition(editor.document, position)
        if (!section) {
            return
        }

        // If a section is already hydrated and was not either marked as dirty or is older than one
        // minute, do not refresh the context.
        if (section.context) {
            const shouldRefresh = section.context.isStale || Date.now() - section.context.lastRevalidateAt > ONE_MINUTE
            if (!shouldRefresh) {
                return
            }
        }

        if (!section.context) {
            section.context = {
                lastRevalidateAt: Date.now(),
                context: null,
                isStale: false,
            }
        } else {
            section.context.lastRevalidateAt = Date.now()
            section.context.isStale = false
        }

        const start = performance.now()
        const context = await this.getGraphContextFromRange(editor, section.location.range)

        logHydratedContext(context, editor, section, start)
        section.context.context = context
    }

    private getSectionAtPosition(document: vscode.TextDocument, position: vscode.Position): Section | undefined {
        return this.activeDocuments
            .get(document.uri.toString())
            ?.sections.find(section => section.location.range.contains(position))
    }

    /**
     * A pretty way to print the current state of all cached sections
     */
    public debugPrint(selectedDocument?: vscode.TextDocument, selections?: readonly vscode.Selection[]): string {
        const lines: string[] = []
        // eslint-disable-next-line ban/ban
        this.activeDocuments.forEach(document => {
            lines.push(document.uri)
            for (const section of document.sections) {
                const isSelected =
                    selectedDocument?.uri.toString() === document.uri &&
                    selections?.some(selection => section.location.range.contains(selection))
                const isLast = document.sections[document.sections.length - 1] === section
                const isHydrated = !!section.context
                const isStale = section.context?.isStale ?? false

                lines.push(
                    `  ${isLast ? '└' : '├'}${isSelected ? '*' : '─'} ` +
                        (section.fuzzyName ?? 'unknown') +
                        (isHydrated
                            ? ` (${
                                  section.context?.context === null
                                      ? 'loading'
                                      : `${section.context?.context.length ?? 0} snippets`
                              }${isStale ? ', dirty' : ''})`
                            : '')
                )
            }
        })
        return lines.join('\n')
    }

    /**
     * Loads or reloads a document's sections and attempts to merge new sections with existing
     * sections.
     *
     * TODO(philipp-spiess): Handle the case that a document is being reloaded while it is still
     * loaded.
     */
    private async loadDocument(document: vscode.TextDocument): Promise<void> {
        const uri = document.uri.toString()
        const lastRevalidateAt = Date.now()
        const lastLines = document.lineCount
        const sections = (await this.getDocumentSections(document)).map(section => ({
            ...section,
            lastRevalidateAt,
            lastLines: section.location.range.end.line - section.location.range.start.line,
            context: null,
        }))

        const existingDocument = this.activeDocuments.get(uri)
        if (!existingDocument) {
            this.activeDocuments.set(uri, {
                uri,
                sections,
                lastRevalidateAt,
                lastLines,
            })
            return
        }

        // If a document already exists, attempt to diff the sections
        const sectionsToRemove: Section[] = []
        for (const existingSection of existingDocument.sections) {
            const key = locationKeyFn(existingSection.location)
            const newSection = sections.find(section => locationKeyFn(section.location) === key)
            if (!newSection) {
                sectionsToRemove.push(existingSection)
            } else if (existingSection.context) {
                // All existing sections that were not removed will be marked as stale so that they
                // are reloaded the next time they are requested.
                // We also update the ranges to make sure they are up to date.
                existingSection.context.isStale = true
                existingSection.location = newSection.location
            }
        }
        for (const sectionToRemove of sectionsToRemove) {
            const index = existingDocument.sections.indexOf(sectionToRemove)
            if (index !== -1) {
                existingDocument.sections.splice(index, 1)
            }
        }
        for (const newSection of sections) {
            const key = locationKeyFn(newSection.location)
            const existingSection = existingDocument.sections.find(section => locationKeyFn(section.location) === key)
            if (!existingSection) {
                existingDocument.sections.push(newSection)
            }
        }
    }

    /**
     * Diff vscode.window.visibleTextEditors with activeDocuments to load new documents or unload
     * those no longer needed.
     *
     * TODO(philipp-spiess): When this method is called while the documents are still being loaded,
     * we might reload a document immediately afterwards.
     */
    private async onDidChangeVisibleTextEditors(): Promise<void> {
        const removedDocuments: string[] = []
        // eslint-disable-next-line ban/ban
        this.activeDocuments.forEach(document => {
            if (!this.window.visibleTextEditors.find(editor => editor.document.uri.toString() === document.uri)) {
                removedDocuments.push(document.uri)
            }
        })
        for (const uri of removedDocuments) {
            this.activeDocuments.delete(uri)
        }

        const promises: Promise<void>[] = []
        for (const editor of this.window.visibleTextEditors) {
            if (editor.document.uri.scheme !== 'file') {
                continue
            }
            const uri = editor.document.uri.toString()
            if (!this.activeDocuments.has(uri)) {
                promises.push(this.loadDocument(editor.document))
            }
        }

        await Promise.all(promises)
    }

    /**
     * TODO(philipp-spiess): We can use the ranges of the change events to mark exactly which
     * sections have been modified to avoid reloading the whole document.
     */
    private async onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): Promise<void> {
        const uri = event.document.uri.toString()
        if (!this.activeDocuments.has(uri)) {
            return
        }

        const document = this.activeDocuments.get(uri)!

        // We start by checking if the document has changed significantly since sections were last
        // loaded. If so, we reload the document which will mark all sections as dirty.
        const documentChangedSignificantly =
            Math.abs(document.lastLines - event.document.lineCount) >= NUM_OF_CHANGED_LINES_FOR_SECTION_RELOAD
        const sectionsOutdated = Date.now() - document.lastRevalidateAt > TEN_MINUTES
        if (documentChangedSignificantly || sectionsOutdated) {
            await this.loadDocument(event.document)
            return
        }

        // Next, we go over all changes and check if the change has been significant enough to mark
        // a section as dirty.
        //
        // TODO(philipp-spiess): We can't reliably detect single line deletions so this might need
        // something smarter.
        for (const change of event.contentChanges) {
            const isNewLineAddition = change.text.includes('\n')

            if (!isNewLineAddition) {
                continue
            }

            const section = this.getSectionAtPosition(event.document, change.range.start)
            if (section?.context) {
                section.context.isStale = true
            }
        }
    }

    /**
     * When the cursor is moving into a tracked selection, we use this as hints to hydrate the
     * context for this section. This way we make it possible for the context retriever to have
     * instant access to these sections.
     */
    private async onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
        await this.hydrateContextAtCursor(event.textEditor, event.selections[0].active)
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}

function preciseContextToSnippet(context: PreciseContext): SymbolContextSnippet {
    const isDts = context.filePath.endsWith('.d.ts')
    return {
        fileName: path.normalize(vscode.workspace.asRelativePath(context.filePath)),
        symbol: context.symbol.fuzzyName ?? '',
        content:
            context.hoverText.length > 0 && !isDts
                ? context.hoverText.map(extractMarkdownCodeBlock).join('\n').trim()
                : context.definitionSnippet,
    }
}

function extractMarkdownCodeBlock(string: string): string {
    const regex = /```([a-z]*)\n([\S\s]*?)(\n```)?/g
    const matches = string.match(regex)
    if (!matches) {
        return ''
    }
    const result = matches.map(m => m.match(/([\S\s]*)(```?)/)![1])
    return (
        result
            .join('\n')
            // The TS language server often adds a loading text which is not helpful for the LLM
            .replaceAll('(loading...)', '')
    )
}

function logHydratedContext(
    context: PreciseContext[],
    editor: vscode.TextEditor,
    section: Section,
    start: number
): void {
    const matchSummary: { [filename: string]: Set<string> } = {}
    for (const match of context.map(preciseContextToSnippet)) {
        const normalizedFilename = path.normalize(vscode.workspace.asRelativePath(match.fileName))
        const set = matchSummary[normalizedFilename] ?? new Set()
        set.add(match.symbol)
        matchSummary[normalizedFilename] = set
    }

    logDebug(
        'GraphContext:hydrated',
        `Preloaded ${context.length} graph matches for ${path.normalize(
            vscode.workspace.asRelativePath(editor.document.uri)
        )}#${section.fuzzyName} (took ${Math.round(performance.now() - start)}ms)`,
        {
            verbose: Object.entries(matchSummary).reduce(
                (acc, [filename, symbols]) => {
                    acc[filename] = [...symbols.values()]
                    return acc
                },
                {} as { [filename: string]: string[] }
            ),
        }
    )
}
