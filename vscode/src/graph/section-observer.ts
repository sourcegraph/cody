import * as vscode from 'vscode'

import { PreciseContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'

import { getGraphContextFromRange as defaultGetGraphContextFromRange, locationKeyFn } from './graph'
import { getDocumentSections as defaultGetDocumentSections, DocumentSection } from './sections'

interface Section extends DocumentSection {
    context: {
        lastRefreshAt: number
        isDirty: boolean
        context: PreciseContext[] | null
    } | null
}

interface ActiveDocument {
    uri: string
    sections: Section[]
    lastRefreshAt: number
    lastLines: number
}

const ONE_MINUTE = 60 * 1000
const TEN_MINUTES = 10 * ONE_MINUTE

const NUM_OF_CHANGED_LINES_FOR_SECTION_RELOAD = 3

/**
 * Watches a document for changes and refreshes the sections if needed. Preloads the sections that
 * the document is being modified by intersecting the cursor position with the document sections.
 *
 * TODO:
 *  - [ ] GC?? How to make sure this does not grow unbound? Limit it to n total sections?
 *  - [ ] How does this work in reality?
 *  - [ ] Migrate all of this logging to use debug() API
 *  - [ ] Track the total number of time spent in the context methods
 */
export class SectionObserver implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    // A map of all active documents that are being tracked.
    private activeDocuments: Map<string, ActiveDocument> = new Map()

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

    public getCachedContextAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): PreciseContext[] | null {
        const section = this.getSectionAtPosition(document, position)
        return section?.context?.context ?? null
    }

    private async hydrateContextAtCursor(editor: vscode.TextEditor, position: vscode.Position): Promise<void> {
        const section = this.getSectionAtPosition(editor.document, position)
        if (!section) {
            return
        }

        // If a section is already hydrated and was not either marked as dirty or is older than one
        // minute, do not refresh the context.
        if (section.context) {
            const shouldRefresh = section.context.isDirty || Date.now() - section.context.lastRefreshAt > ONE_MINUTE
            if (!shouldRefresh) {
                return
            }
        }

        if (!section.context) {
            section.context = {
                lastRefreshAt: Date.now(),
                context: null,
                isDirty: false,
            }
        } else {
            section.context.lastRefreshAt = Date.now()
            section.context.isDirty = false
        }

        section.context.context = await this.getGraphContextFromRange(editor, section.location.range)
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
        for (const document of this.activeDocuments.values()) {
            lines.push(document.uri)
            for (const section of document.sections) {
                const isSelected =
                    selectedDocument?.uri.toString() === document.uri &&
                    selections?.some(selection => section.location.range.contains(selection))
                const isLast = document.sections[document.sections.length - 1] === section
                const isHydrated = !!section.context
                const isDirty = section.context?.isDirty ?? false

                lines.push(
                    `  ${isLast ? '└' : '├'}${isSelected ? '*' : '─'} ` +
                        (section.fuzzyName ?? 'unknown') +
                        (isHydrated
                            ? ` (${
                                  section.context?.context === null
                                      ? 'loading'
                                      : `${section.context?.context.length ?? 0} snippets`
                              }${isDirty ? ', dirty' : ''})`
                            : '')
                )
            }
        }
        return lines.join('\n')
    }

    /**
     * Loads or reloads a document's sections and attempts to merge new sections with existing
     * sections.
     *
     * @TODO(philipp-spiess): Handle the case that a document is being reloaded while it is still
     * loaded.
     */
    private async loadDocument(document: vscode.TextDocument): Promise<void> {
        const uri = document.uri.toString()
        const lastRefreshAt = Date.now()
        const lastLines = document.lineCount
        const sections = (await this.getDocumentSections(document)).map(section => ({
            ...section,
            lastRefreshAt,
            lastLines: section.location.range.end.line - section.location.range.start.line,
            context: null,
        }))

        const existingDocument = this.activeDocuments.get(uri)
        if (!existingDocument) {
            this.activeDocuments.set(uri, {
                uri,
                sections,
                lastRefreshAt,
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
                // All existing sections that were not removed will be marked as
                // dirty so that they are reloaded the next time they are
                // requested.
                existingSection.context.isDirty = true
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
     * @TODO(philipp-spiess): When this method is called while the documents are still being loaded,
     * we might reload a document immediately afterwards.
     */
    private async onDidChangeVisibleTextEditors(): Promise<void> {
        const removedDocuments: string[] = []
        for (const document of this.activeDocuments.values()) {
            if (!this.window.visibleTextEditors.find(editor => editor.document.uri.toString() === document.uri)) {
                removedDocuments.push(document.uri)
            }
        }
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
     * @TODO(philipp-spiess): We can use the ranges of the change events to mark exactly which
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
        const sectionsOutdated = Date.now() - document.lastRefreshAt > TEN_MINUTES
        if (documentChangedSignificantly || sectionsOutdated) {
            await this.loadDocument(event.document)
            return
        }

        // Next, we go over all changes and check if the change has been significant enough to mark
        // a section as dirty.
        //
        // @TODO(philipp-spiess): We can't reliably detect single line deletions so this might need
        // something smarter.
        for (const change of event.contentChanges) {
            const isNewLineAddition = change.text.includes('\n')

            if (!isNewLineAddition) {
                continue
            }

            const section = this.getSectionAtPosition(event.document, change.range.start)
            if (section?.context) {
                section.context.isDirty = true
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
