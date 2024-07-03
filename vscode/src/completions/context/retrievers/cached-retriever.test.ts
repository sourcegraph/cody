import { type AutocompleteContextSnippet, testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { type MockInstance, afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { getCurrentDocContext } from '../../get-current-doc-context'
import { document, documentAndPosition } from '../../test-helpers'
import type { ContextRetrieverOptions } from '../../types'
import { type CachedRerieverOptions, CachedRetriever } from './cached-retriever'

class MockWorkspace implements Partial<typeof vscode.workspace> {
    public didChangeTextDocumentListener: (event: vscode.TextDocumentChangeEvent) => void = () => {}

    onDidChangeTextDocument = (
        listener: (event: vscode.TextDocumentChangeEvent) => void
    ): vscode.Disposable => {
        this.didChangeTextDocumentListener = listener
        return { dispose: () => {} }
    }

    openTextDocument(uri: any): Promise<vscode.TextDocument> {
        return Promise.resolve(document('foo', 'typescript', uri.toString()))
    }
}

class MockCachedRetriever extends CachedRetriever {
    identifier = 'mock'
    spy: MockInstance

    constructor(
        options?: CachedRerieverOptions,
        public workspace: MockWorkspace = new MockWorkspace()
    ) {
        super(options, workspace)
        this.spy = vi.spyOn(this as MockCachedRetriever, 'doRetrieval')
    }

    toCacheKey = ({ document: { uri }, position: { line } }: ContextRetrieverOptions) => `${uri}:${line}`

    doRetrieval = async (options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> => {
        return []
    }

    isSupportedForLanguageId = () => true
}

// Mock retriever which opens the given file when it is called
class FileOpeningRetriever extends MockCachedRetriever {
    identifier = 'file-opening'

    constructor(
        options?: CachedRerieverOptions,
        public workspace: MockWorkspace = new MockWorkspace()
    ) {
        super(options, workspace)
        this.spy = vi.spyOn(this as FileOpeningRetriever, 'doRetrieval')
    }

    doRetrieval = async (options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> => {
        this.openTextDocument(options.document.uri)
        return []
    }
}

const { document: testDocument, position: testPosition } = documentAndPosition(
    dedent`
        // Write a test for the class TestClass
        █
    `,
    'typescript',
    testFileUri('test-class.test.ts').toString()
)

function getRetrieverOptions(
    document: vscode.TextDocument = testDocument,
    position: vscode.Position = testPosition
): ContextRetrieverOptions {
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 100,
        maxSuffixLength: 0,
    })
    return {
        document,
        position,
        docContext,
    }
}

describe('CachedRetriever', () => {
    beforeAll(() => {
        vi.useFakeTimers()
    })

    afterAll(() => {
        vi.useRealTimers()
    })

    const mockOptions = getRetrieverOptions()
    it('should cache context correctly', async () => {
        const retriever = new MockCachedRetriever()
        await retriever.retrieve(mockOptions)
        expect(retriever.spy).toHaveBeenCalledTimes(1)
        await retriever.retrieve(mockOptions)

        expect(retriever.spy).toHaveBeenCalledTimes(1)
    })

    it("should not cache context if the input document's uri changes", async () => {
        const retriever = new MockCachedRetriever()
        await retriever.retrieve(mockOptions)
        expect(retriever.spy).toHaveBeenCalledTimes(1)

        const newUri = vscode.Uri.file('/path/to/new/file')
        const newOptions: ContextRetrieverOptions = {
            ...mockOptions,
            document: { ...mockOptions.document, uri: newUri },
        }
        await retriever.retrieve(newOptions)
        expect(retriever.spy).toHaveBeenCalledTimes(2)
    })

    it('should recalculate if a dependency is invalidated', async () => {
        const retriever = new FileOpeningRetriever()
        await retriever.retrieve(mockOptions)
        expect(retriever.spy).toHaveBeenCalledTimes(1)

        // Simulate an update to a file that this entry depends on
        retriever.workspace.didChangeTextDocumentListener({
            document: mockOptions.document,
            // We need at least one change to trigger the update
            contentChanges: [{} as unknown as vscode.TextDocumentContentChangeEvent],
            reason: undefined,
        })
        vi.advanceTimersByTime(1000)
        await retriever.retrieve(mockOptions)
        expect(retriever.spy).toHaveBeenCalledTimes(2)
    })

    it('should use cached value if an unrelated dependency is invalidated', async () => {
        const retriever = new FileOpeningRetriever()
        await retriever.retrieve(mockOptions)
        expect(retriever.spy).toHaveBeenCalledTimes(1)

        // Invalidate an unrelated dependency
        retriever.workspace.didChangeTextDocumentListener({
            document: { ...testDocument, uri: vscode.Uri.file('/path/to/unrelated/file') },
            contentChanges: [{} as unknown as vscode.TextDocumentContentChangeEvent],
            reason: undefined,
        })
        vi.advanceTimersByTime(1000)

        await retriever.retrieve(mockOptions)
        expect(retriever.spy).toHaveBeenCalledTimes(1)
    })

    it('should invalidate dependencies if entries are evicted from the cache', async () => {
        const retriever = new FileOpeningRetriever({
            dependencyCacheOptions: {
                max: 1,
            },
        })
        await retriever.retrieve(mockOptions)
        expect(retriever.spy).toHaveBeenCalledTimes(1)

        const { document: testDocument2, position: testPosition2 } = documentAndPosition(
            dedent`
            // Write a test for the class TestClass
            █
            `,
            'typescript',
            testFileUri('test-class2.test.ts').toString()
        )

        // Second document causes the dependency cache to fill and evicts
        // previous entry
        const newOptions = getRetrieverOptions(testDocument2, testPosition2)
        await retriever.retrieve(newOptions)
        expect(retriever.spy).toHaveBeenCalledTimes(2)

        // rerun with existing options but re-evaluate because of eviction
        await retriever.retrieve(mockOptions)
        expect(retriever.spy).toHaveBeenCalledTimes(3)
    })
})
