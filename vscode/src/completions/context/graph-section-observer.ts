import path from 'path'

import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { HoverContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { dedupeWith, isDefined } from '@sourcegraph/cody-shared/src/common'
import { isAbortError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { getGraphContextFromRange as defaultGetGraphContextFromRange, locationKeyFn } from '../../graph/graph'
import { getDocumentSections as defaultGetDocumentSections, DocumentSection } from '../../graph/sections'
import { logDebug, logError } from '../../log'
import { ContextSnippet, SymbolContextSnippet } from '../types'
import { createSubscriber } from '../utils'

import { GraphContextFetcher } from './context-graph'
import { baseLanguageId, CustomAbortController } from './utils'

interface Section extends DocumentSection {
    preloadedContext: {
        lastRevalidateAt: number
        isStale: boolean
        graphContext: HoverContext[] | null
    } | null
}

interface ActiveDocument {
    uri: URI
    languageId: string
    sections: Section[]
    lastRevalidateAt: number
    lastLines: number
}

const ONE_MINUTE = 60 * 1000
const TEN_MINUTES = 10 * ONE_MINUTE

const NUM_OF_CHANGED_LINES_FOR_SECTION_RELOAD = 3

const MAX_TRACKED_DOCUMENTS = 10
const MAX_LAST_VISITED_SECTIONS = 10

const debugSubscriber = createSubscriber<void>()
export const registerDebugListener = debugSubscriber.subscribe.bind(debugSubscriber)

/**
 * Watches a document for changes and refreshes the sections if needed. Preloads the sections that
 * the document is being modified by intersecting the cursor position with the document sections.
 *
 * Each section will behave like a stale-while-revalidate cache in that it will serve the previous
 * context while it is still being revalidated.
 */
export class GraphSectionObserver implements vscode.Disposable, GraphContextFetcher {
    private disposables: vscode.Disposable[] = []

    // A map of all active documents that are being tracked. We rely on the LRU cache to evict
    // documents that are not being tracked anymore.
    private activeDocuments: LRUCache<string, ActiveDocument> = new LRUCache<string, ActiveDocument>({
        max: MAX_TRACKED_DOCUMENTS,
    })
    // A list of up to ten sections that were being visited last as identifier via their location.
    private lastVisitedSections: vscode.Location[] = []

    // Some book keeping so we can abort non-resolved graph context requests.
    private lastRequestGraphContextSectionKey: string | null = null
    private abortLastRequestGraphContext: () => void = () => {}

    private constructor(
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

    public static instance: GraphSectionObserver | null = null
    public static createInstance(
        window?: Pick<
            typeof vscode.window,
            'onDidChangeVisibleTextEditors' | 'onDidChangeTextEditorSelection' | 'visibleTextEditors'
        >,
        workspace?: Pick<typeof vscode.workspace, 'onDidChangeTextDocument'>,
        getDocumentSections?: typeof defaultGetDocumentSections,
        getGraphContextFromRange?: typeof defaultGetGraphContextFromRange
    ): GraphSectionObserver {
        if (this.instance) {
            throw new Error('SectionObserver has already been initialized')
        }
        this.instance = new GraphSectionObserver(window, workspace, getDocumentSections, getGraphContextFromRange)
        return this.instance
    }

    public async getContextAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position,
        maxChars: number,
        // Allow the caller to pass a range for the context. We won't return any symbols that are
        // defined inside this range.
        contextRange?: vscode.Range
    ): Promise<ContextSnippet[]> {
        const section = this.getSectionAtPosition(document, position)
        const sectionGraphContext = section?.preloadedContext?.graphContext

        let usedContextChars = 0
        const context: ContextSnippet[] = []

        function overlapsContextRange(uri: vscode.Uri, range?: { startLine: number; endLine: number }): boolean {
            if (!contextRange || !range || uri.toString() !== document.uri.toString()) {
                return false
            }

            return contextRange.start.line <= range.startLine && contextRange.end.line >= range.endLine
        }

        const sectionHistory = (
            await Promise.all(
                this.lastVisitedSections
                    .map(location => this.getActiveDocumentAndSectionForLocation(location))
                    .filter(isDefined)
                    // Remove any sections that are not in the same language as the current document
                    .filter(
                        ([sectionDocument]) =>
                            baseLanguageId(sectionDocument.languageId) === baseLanguageId(document.languageId)
                    )
                    .map(([, section]) => section)
                    // Exclude the current section which should be included already as part of the
                    // prefix/suffix.
                    .filter(
                        compareSection =>
                            locationKeyFn(compareSection.location) !==
                            (section ? locationKeyFn(section.location) : null)
                    )
                    // Remove sections that overlap the current prefix/suffix range to avoid
                    // duplication.
                    .filter(
                        section =>
                            !overlapsContextRange(section.location.uri, {
                                startLine: section.location.range.start.line,
                                endLine: section.location.range.end.line,
                            })
                    )
                    // Load the file contents for the sections.
                    .map(async section => {
                        try {
                            const uri = section.location.uri
                            const textDocument = await vscode.workspace.openTextDocument(uri)
                            const fileName = path.normalize(vscode.workspace.asRelativePath(uri.fsPath))
                            const content = textDocument.getText(section.location.range)
                            return { fileName, content }
                        } catch (error) {
                            // Ignore errors opening the text file. This can happen when the file was deleted
                            console.error(error)
                            return undefined
                        }
                    })
            )
        ).filter(isDefined)

        // Allocate up to 40% of the maxChars budget to inlining previous section unless the current
        // section is not hydrated with graph context.
        const maxCharsForPreviousSections = sectionGraphContext ? maxChars * 0.4 : maxChars
        for (const historyContext of sectionHistory) {
            if (usedContextChars + historyContext.content.length > maxCharsForPreviousSections) {
                // We use continue here to test potentially smaller context snippets that might
                // still fit inside the budget
                continue
            }
            usedContextChars += historyContext.content.length
            context.push(historyContext)
        }

        if (sectionGraphContext) {
            const preciseContexts = hoverContextsToSnippets(
                sectionGraphContext.filter(context => !overlapsContextRange(URI.parse(context.uri), context.range))
            )
            for (const preciseContext of preciseContexts) {
                if (usedContextChars + preciseContext.content.length > maxChars) {
                    // We use continue here to test potentially smaller context snippets that might
                    // still fit inside the budget
                    continue
                }
                usedContextChars += preciseContext.content.length
                context.push(preciseContext)
            }
        }

        return context
    }

    private async hydrateContextAtCursor(editor: vscode.TextEditor, position: vscode.Position): Promise<void> {
        const section = this.getSectionAtPosition(editor.document, position)
        if (!section) {
            return
        }

        pushUniqueAndTruncate(this.lastVisitedSections, section.location, MAX_LAST_VISITED_SECTIONS)

        // If a section is already hydrated and was not either marked as dirty or is older than one
        // minute, do not refresh the context.
        if (section.preloadedContext) {
            const shouldRefresh =
                section.preloadedContext.isStale || Date.now() - section.preloadedContext.lastRevalidateAt > ONE_MINUTE
            if (!shouldRefresh) {
                return
            }
        }

        if (section.preloadedContext) {
            section.preloadedContext.lastRevalidateAt = Date.now()
            section.preloadedContext.isStale = false
        } else {
            section.preloadedContext = {
                lastRevalidateAt: Date.now(),
                graphContext: null,
                isStale: false,
            }
        }

        debugSubscriber.notify()

        const start = performance.now()
        const sectionKey = locationKeyFn(section.location)
        const abortController = new CustomAbortController()

        // Abort previous requests that have not yet resolved and are for a different section
        if (this.lastRequestGraphContextSectionKey && this.lastRequestGraphContextSectionKey !== sectionKey) {
            this.abortLastRequestGraphContext()
        }
        this.lastRequestGraphContextSectionKey = sectionKey
        this.abortLastRequestGraphContext = () => abortController.abort()

        try {
            const context = await this.getGraphContextFromRange(editor, section.location.range, abortController.signal)

            logHydratedContext(context, editor, section, start)
            section.preloadedContext.graphContext = context
        } catch (error) {
            section.preloadedContext = null

            if (!isAbortError(error)) {
                logError('GraphContext:error', isError(error) ? error.message : 'error', { verbose: error })
            }

            throw error
        } finally {
            debugSubscriber.notify()
        }
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
            lines.push(vscode.workspace.asRelativePath(document.uri))
            for (const section of document.sections) {
                const isSelected =
                    selectedDocument?.uri.toString() === document.uri.toString() &&
                    selections?.some(selection => section.location.range.contains(selection))
                const isLast = document.sections.at(-1) === section
                const isHydrated = !!section.preloadedContext
                const isStale = section.preloadedContext?.isStale ?? false

                lines.push(
                    `  ${isLast ? '└' : '├'}${isSelected ? '*' : '─'} ` +
                        (section.fuzzyName ?? 'unknown') +
                        (isHydrated
                            ? ` (${
                                  section.preloadedContext?.graphContext === null
                                      ? 'loading'
                                      : `${section.preloadedContext?.graphContext.length ?? 0} snippets`
                              }${isStale ? ', dirty' : ''})`
                            : '')
                )
            }
        })

        const lastSections = this.lastVisitedSections
            .map(loc => this.getActiveDocumentAndSectionForLocation(loc)?.[1])
            .filter(isDefined)
        if (lastSections.length > 0) {
            lines.push('')
            lines.push('Last visited sections:')
            for (let i = 0; i < lastSections.length; i++) {
                const section = lastSections[i]
                const isLast = i === lastSections.length - 1

                lines.push(
                    `  ${isLast ? '└' : '├'} ${vscode.workspace.asRelativePath(section.location.uri)} ${
                        section.fuzzyName ?? 'unknown'
                    }`
                )
            }
        }

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
        const uri = document.uri
        const lastRevalidateAt = Date.now()
        const lastLines = document.lineCount
        const sections = (await this.getDocumentSections(document)).map(section => ({
            ...section,
            lastRevalidateAt,
            lastLines: section.location.range.end.line - section.location.range.start.line,
            preloadedContext: null,
        }))

        const existingDocument = this.activeDocuments.get(uri.toString())
        if (!existingDocument) {
            this.activeDocuments.set(uri.toString(), {
                uri,
                languageId: document.languageId,
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
            } else if (existingSection.preloadedContext) {
                // All existing sections that were not removed will be marked as stale so that they
                // are reloaded the next time they are requested.
                // We also update the ranges to make sure they are up to date.
                existingSection.preloadedContext.isStale = true
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

        debugSubscriber.notify()
    }

    /**
     * Diff vscode.window.visibleTextEditors with activeDocuments to load new documents or unload
     * those no longer needed.
     *
     * We rely on the LRU cache to evict documents that are no longer visible.
     *
     * TODO(philipp-spiess): When this method is called while the documents are still being loaded,
     * we might reload a document immediately afterwards.
     */
    private async onDidChangeVisibleTextEditors(): Promise<void> {
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

    private getActiveDocumentAndSectionForLocation(location: vscode.Location): [ActiveDocument, Section] | undefined {
        const uri = location.uri.toString()
        if (!this.activeDocuments.has(uri)) {
            return undefined
        }
        const document = this.activeDocuments.get(uri)
        if (!document) {
            return undefined
        }
        const locationKey = locationKeyFn(location)
        const section = document.sections.find(section => locationKeyFn(section.location) === locationKey)
        if (section) {
            return [document, section]
        }
        return undefined
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
            if (section?.preloadedContext) {
                section.preloadedContext.isStale = true
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
        GraphSectionObserver.instance = null
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        debugSubscriber.notify()
    }
}

function hoverContextsToSnippets(contexts: HoverContext[]): SymbolContextSnippet[] {
    return dedupeWith(contexts.map(hoverContextToSnippets), context =>
        [context.symbol, context.fileName, context.content].join('\n')
    )
}

function hoverContextToSnippets(context: HoverContext): SymbolContextSnippet {
    const sourceSymbolAndRelationship =
        context.sourceSymbolName && context.type !== 'definition'
            ? { symbol: context.sourceSymbolName, relationship: context.type }
            : undefined

    return {
        fileName: path.normalize(vscode.workspace.asRelativePath(URI.parse(context.uri).fsPath)),
        symbol: context.symbolName,
        sourceSymbolAndRelationship,
        content: context.content.join('\n').trim(),
    }
}

function logHydratedContext(context: HoverContext[], editor: vscode.TextEditor, section: Section, start: number): void {
    const matchSummary: { [filename: string]: Set<string> } = {}
    for (const match of hoverContextsToSnippets(context)) {
        if (!match) {
            continue
        }
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

function pushUniqueAndTruncate(array: vscode.Location[], item: vscode.Location, truncate: number): vscode.Location[] {
    const indexOf = array.findIndex(i => locationKeyFn(i) === locationKeyFn(item))
    if (indexOf > -1) {
        // Remove the item so it is put to the front again
        array.splice(indexOf, 1)
    }
    if (array.length >= truncate) {
        array.pop()
    }
    array.unshift(item)
    return array
}
