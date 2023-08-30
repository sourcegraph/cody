import * as vscode from 'vscode'

import { DocumentSection, getDocumentSections } from '../../../chat/GraphContextProvider'

interface ActiveDocument {
    uri: string
    sections: DocumentSection[]
    lastRefreshAt: number
    lastLines: number
}

const TEN_MINUTES = 10 * 60 * 1000

export function createSectionObserver(): vscode.Disposable {
    const disposables: vscode.Disposable[] = []

    // The active documents map maps to a promise so we can be sure the ranges are resolved even if
    // we immediately enqueue change events
    const activeDocuments: Map<string, Promise<ActiveDocument>> = new Map()

    async function debugPrint(
        selectedDocument?: vscode.TextDocument,
        selections?: readonly vscode.Selection[]
    ): Promise<void> {
        console.log('\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n')
        console.clear()

        for (const activeDocument of activeDocuments.values()) {
            const document = await activeDocument

            console.log(document.uri)
            for (const section of document.sections) {
                const isSelected =
                    selectedDocument?.uri.toString() === document.uri &&
                    selections?.some(selection => section.range.contains(selection))
                console.log(`  ${isSelected ? '*' : '-'} ` + (section.fuzzyName ?? 'unknown'))
            }
        }
    }

    // Refreshes the ranges of an active document
    async function refreshActiveDocument(document: vscode.TextDocument): Promise<ActiveDocument> {
        try {
            const uri = document.uri.toString()
            const lastRefreshAt = Date.now()
            const lastLines = document.lineCount
            const sections = await getDocumentSections(document)

            return {
                uri,
                sections,
                lastRefreshAt,
                lastLines,
            }
        } catch (error) {
            console.error(error)
            throw error
        }
    }

    // Diff vscode.window.visibleTextEditors with activeDocuments to load new documents or unload
    // those no longer needed
    async function onDidChangeVisibleTextEditors(): Promise<void> {
        const removedDocuments: string[] = []
        for (const documentPromise of activeDocuments.values()) {
            const document = await documentPromise

            if (!vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === document.uri)) {
                removedDocuments.push(document.uri)
            }
        }
        for (const uri of removedDocuments) {
            activeDocuments.delete(uri)
        }

        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.scheme !== 'file') {
                continue
            }
            const uri = editor.document.uri.toString()
            if (!activeDocuments.has(uri)) {
                activeDocuments.set(uri, refreshActiveDocument(editor.document))
            }
        }

        // void debugPrint()
    }

    async function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): Promise<void> {
        const uri = event.document.uri.toString()
        if (!activeDocuments.has(uri)) {
            return
        }

        const activeDocument = await activeDocuments.get(uri)!

        const moreThanTwoLinesChanged = Math.abs(activeDocument.lastLines - event.document.lineCount) > 2
        const sectionsOutdated = Date.now() - activeDocument.lastRefreshAt > TEN_MINUTES

        if (moreThanTwoLinesChanged || sectionsOutdated) {
            activeDocuments.set(uri, refreshActiveDocument(event.document))
        }

        // void debugPrint()
    }

    function onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
        void debugPrint(event.textEditor.document, event.selections)
    }

    disposables.push(vscode.window.onDidChangeVisibleTextEditors(onDidChangeVisibleTextEditors))
    disposables.push(vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument))
    disposables.push(vscode.window.onDidChangeTextEditorSelection(onDidChangeTextEditorSelection))
    void onDidChangeVisibleTextEditors()

    return vscode.Disposable.from(...disposables)
}
