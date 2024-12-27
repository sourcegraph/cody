import fs from 'node:fs'
import dedent from 'dedent'
import type * as vscode from 'vscode'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { type CompletionResponse, testFileUri } from '@sourcegraph/cody-shared'

import { wrapVSCodeTextDocument } from '../testutils/textDocument'
import { Uri } from '../testutils/uri'

export * from '../tree-sitter/test-helpers'

/**
 * A tag function for creating a {@link CompletionResponse}, for use in tests only.
 *
 * - `├` start of the inline completion to insert
 * - `┤` end of the inline completion to insert
 * - `┴` use for indent placeholder, should be placed at last line after `┤`
 */
export function completion(string: TemplateStringsArray, ...values: unknown[]): CompletionResponse {
    const raw = dedent(string, ...values)
    let completion = raw

    const start = raw.indexOf('├')
    const end = raw.lastIndexOf('┤')
    if (0 <= start && start <= end) {
        completion = raw.slice(start + 1, end)
    }

    return {
        completion,
        stopReason: 'unknown',
    }
}

const CURSOR_MARKER = '█'

export function document(
    text: string,
    languageId = 'typescript',
    uriString = testFileUri('test.ts').toString()
): vscode.TextDocument {
    return wrapVSCodeTextDocument(TextDocument.create(uriString, languageId, 0, text))
}

export function documentFromFilePath(filePath: string, languageId = 'typescript'): vscode.TextDocument {
    return wrapVSCodeTextDocument(
        TextDocument.create(
            Uri.file(filePath).toString(),
            languageId,
            0,
            fs.readFileSync(filePath, 'utf8')
        )
    )
}

export function documentAndPosition(
    textWithCursor: string,
    languageId?: string,
    uriString?: string
): { document: vscode.TextDocument; position: vscode.Position } {
    const { prefix, suffix, cursorIndex } = prefixAndSuffix(textWithCursor)

    const doc = document(prefix + suffix, languageId, uriString)
    const position = doc.positionAt(cursorIndex)
    return { document: doc, position }
}

export function prefixAndSuffix(textWithCursor: string): {
    prefix: string
    suffix: string
    cursorIndex: number
} {
    const cursorIndex = textWithCursor.indexOf(CURSOR_MARKER)
    if (cursorIndex === -1) {
        throw new Error(`The test text must include a ${CURSOR_MARKER} to denote the cursor position.`)
    }
    const prefix = textWithCursor.slice(0, cursorIndex)
    const suffix = textWithCursor.slice(cursorIndex + CURSOR_MARKER.length)

    return { prefix, suffix, cursorIndex }
}

//-------------------------------------------
// vscode.NotebookDocument mocks
//-------------------------------------------

export function mockNotebookAndPosition({
    uri,
    cells,
    notebookType,
}: {
    /**
     * Notebook URI as a string, e.g. 'file://test.ipynb'.
     */
    uri: string
    /**
     * Cells to create.
     * - `kind`: NotebookCellKind.Code or NotebookCellKind.Markup
     * - `text`: Cell content
     * - `languageId`: The language ID for the cell document
     */
    cells: {
        kind: vscode.NotebookCellKind
        text: string
        languageId?: string
    }[]
    notebookType?: string
}): { notebookDoc: vscode.NotebookDocument; position: vscode.Position } {
    const mockUri = Uri.parse(uri)

    const notebookDoc = new MockNotebookDocument({
        uri: mockUri,
        notebookType: notebookType ?? 'mock-notebook',
        cells: [],
    })

    const positionsWithCursorInNotebook: vscode.Position[] = []

    const mockCells: vscode.NotebookCell[] = cells.map((cellData, index) => {
        let cellText = cellData.text
        let notebookCursorIndex = -1

        if (cellData.text.includes(CURSOR_MARKER)) {
            const { prefix, suffix, cursorIndex } = prefixAndSuffix(cellData.text)
            cellText = prefix + suffix
            notebookCursorIndex = cursorIndex
        }
        const cellTextDoc = wrapVSCodeTextDocument(
            TextDocument.create(
                `vscode-notebook-cell://mock/${index}`,
                cellData.languageId ?? 'plaintext',
                0, // version
                cellText
            )
        )
        if (notebookCursorIndex !== -1) {
            positionsWithCursorInNotebook.push(cellTextDoc.positionAt(notebookCursorIndex))
        }

        return new MockNotebookCell({
            index,
            notebook: notebookDoc,
            kind: cellData.kind,
            document: cellTextDoc,
        })
    })

    if (positionsWithCursorInNotebook.length !== 1) {
        throw new Error(
            `Only one cell is currently supported to have a cursor position in notebook, received: ${positionsWithCursorInNotebook.length}`
        )
    }
    // Patch the internal cells array
    // We do not create cells first to ensure they have a
    // parent notebook reference.
    ;(notebookDoc as any).cellsInternal = mockCells
    notebookDoc.cellCount = mockCells.length

    return { notebookDoc, position: positionsWithCursorInNotebook[0] }
}

class NotebookCellOutput implements vscode.NotebookCellOutput {
    public readonly items: vscode.NotebookCellOutputItem[]
    public readonly metadata: { [key: string]: any }

    constructor(items: vscode.NotebookCellOutputItem[], metadata: { [key: string]: any } = {}) {
        this.items = items
        this.metadata = metadata
    }
}

class MockNotebookCell implements vscode.NotebookCell {
    public readonly index: number
    public readonly notebook: vscode.NotebookDocument
    public readonly kind: vscode.NotebookCellKind
    public readonly document: vscode.TextDocument
    public readonly metadata: { readonly [key: string]: any }
    public readonly outputs: readonly NotebookCellOutput[]
    public readonly executionSummary: vscode.NotebookCellExecutionSummary | undefined

    constructor({
        index,
        notebook,
        kind,
        document,
        metadata = {},
        outputs = [],
        executionSummary,
    }: {
        index: number
        notebook: vscode.NotebookDocument
        kind: vscode.NotebookCellKind
        document: vscode.TextDocument
        metadata?: { readonly [key: string]: any }
        outputs?: NotebookCellOutput[]
        executionSummary?: vscode.NotebookCellExecutionSummary
    }) {
        this.index = index
        this.notebook = notebook
        this.kind = kind
        this.document = document
        this.metadata = metadata
        this.outputs = outputs
        this.executionSummary = executionSummary
    }
}

class MockNotebookDocument implements vscode.NotebookDocument {
    public readonly uri: Uri
    public readonly notebookType: string
    public version: number
    public isDirty: boolean
    public isUntitled: boolean
    public isClosed: boolean
    public readonly metadata: { [key: string]: any }
    public cellCount: number
    private cellsInternal: vscode.NotebookCell[]

    constructor({
        uri,
        notebookType = 'mock-notebook',
        version = 1,
        isDirty = false,
        isUntitled = false,
        isClosed = false,
        metadata = {},
        cells = [],
    }: {
        uri: Uri
        notebookType?: string
        version?: number
        isDirty?: boolean
        isUntitled?: boolean
        isClosed?: boolean
        metadata?: { [key: string]: any }
        cells?: vscode.NotebookCell[]
    }) {
        this.uri = uri
        this.notebookType = notebookType
        this.version = version
        this.isDirty = isDirty
        this.isUntitled = isUntitled
        this.isClosed = isClosed
        this.metadata = metadata
        this.cellsInternal = cells
        this.cellCount = cells.length
    }

    public cellAt(index: number): vscode.NotebookCell {
        const cell = this.cellsInternal[index]
        if (!cell) {
            throw new Error(`No cell found at index ${index}`)
        }
        return cell
    }

    public getCells(range?: vscode.NotebookRange): vscode.NotebookCell[] {
        if (!range) {
            return this.cellsInternal
        }
        const start = Math.max(0, range.start)
        const end = Math.min(this.cellsInternal.length, range.end)
        return this.cellsInternal.slice(start, end)
    }

    public async save(): Promise<boolean> {
        // Simulate saving
        this.isDirty = false
        return true
    }
}
