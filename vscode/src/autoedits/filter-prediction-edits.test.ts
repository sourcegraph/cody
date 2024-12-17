import { afterEach } from 'node:test'
import dedent from 'dedent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import { getTextDocumentChangesForText } from '../completions/context/retrievers/recent-user-actions/recent-edits-diff-helpers/helper'
import { document } from '../completions/test-helpers'
import { FilterPredictionBasedOnRecentEdits } from './filter-prediction-edits'

describe('FilterPredictionBasedOnRecentEdits', () => {
    let filterStrategy: FilterPredictionBasedOnRecentEdits
    // Mock workspace APIs to trigger document changes
    let onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => void
    let onDidOpenTextDocument: (event: vscode.TextDocument) => void

    beforeEach(() => {
        vi.useFakeTimers()
        filterStrategy = new FilterPredictionBasedOnRecentEdits({
            onDidChangeTextDocument(listener) {
                onDidChangeTextDocument = listener
                return { dispose: () => {} }
            },
            onDidRenameFiles() {
                return { dispose: () => {} }
            },
            onDidDeleteFiles() {
                return { dispose: () => {} }
            },
            onDidOpenTextDocument(listener) {
                onDidOpenTextDocument = listener
                return { dispose: () => {} }
            },
        })
    })

    afterEach(() => {
        vi.clearAllTimers()
        filterStrategy.dispose()
    })

    const assertShouldFilterPrediction = (param: {
        documentTextWithChanges: string
        codeToRewrite: string
        prediction: string
        expectedFilterValue: boolean
    }) => {
        const { originalText, changes } = getTextDocumentChangesForText(param.documentTextWithChanges)
        const doc = document(originalText)

        onDidOpenTextDocument(doc)

        for (const change of changes) {
            onDidChangeTextDocument({
                document: doc,
                contentChanges: [change.change],
                reason: undefined,
            })
        }
        const result = filterStrategy.shouldFilterPrediction(
            doc.uri,
            param.prediction,
            param.codeToRewrite
        )
        expect(result).toBe(param.expectedFilterValue)
    }

    it('should filter prediction if most recent addition is predicted for deletion', () => {
        const text = dedent`
            const a = 5;
            console.log('test');
            const data = 5;
            function test() {
                const <IC>b = 5;</IC>
                return true;
            }
        `
        const codeToRewrite = dedent`
            function test() {
                const b = 5;
                return true;
            }
        `
        const prediction = dedent`
            function test() {
                const b
                return true;
            }
        `
        assertShouldFilterPrediction({
            documentTextWithChanges: text,
            codeToRewrite,
            prediction,
            expectedFilterValue: true,
        })
    })

    it('should filter prediction if most recent deletion is predicted for addition', () => {
        const text = dedent`
            const a = 5;
            console.log('test');
            const data = 5;
            function test() {
                const b<DC> = 5;</DC>
                return true;
            }
        `
        const codeToRewrite = dedent`
            function test() {
                const b
                return true;
            }
        `
        const prediction = dedent`
            function test() {
                const b = 5;
                return true;
            }
        `
        assertShouldFilterPrediction({
            documentTextWithChanges: text,
            codeToRewrite,
            prediction,
            expectedFilterValue: true,
        })
    })

    it('should filter multi line prediction if most recent addition is predicted for deletion', () => {
        const text = dedent`
            const a = 5;
            console.log('test');
            const data = 5;
            function<IC> test() {
                const b = 5;
                return true;
            }</IC>
        `
        const codeToRewrite = dedent`
            function test() {
                const b = 5;
                return true;
            }
        `
        const prediction = dedent`
            function
        `
        assertShouldFilterPrediction({
            documentTextWithChanges: text,
            codeToRewrite,
            prediction,
            expectedFilterValue: true,
        })
    })

    it('should filter multi line prediction if most recent deletion is predicted for addition', () => {
        const text = dedent`
            const a = 5;
            console.log('test');
            const data = 5;
            function<DC> test() {
                const b = 5;
                return true;
            }</DC>
        `
        const codeToRewrite = dedent`
            function
        `
        const prediction = dedent`
            function test() {
                const b = 5;
                return true;
            }
        `
        assertShouldFilterPrediction({
            documentTextWithChanges: text,
            codeToRewrite,
            prediction,
            expectedFilterValue: true,
        })
    })

    it('should filter prediction if multiple changes are reverted', () => {
        const text = dedent`
            const a = 5
            console.log('test')
            const data = 5
            function test() {
                const<I> b = 5;</I>
                const<I> c = 10;</I>
                return true
            }
        `
        const codeToRewrite = dedent`
            function test() {
                const b = 5;
                const c = 10;
                return true
            }
        `
        const prediction = dedent`
            function test() {
                const
                const
                return true
            }
        `
        assertShouldFilterPrediction({
            documentTextWithChanges: text,
            codeToRewrite,
            prediction,
            expectedFilterValue: true,
        })
    })

    it('should filter prediction when only the latest change is reverted', () => {
        const text = dedent`
            const a = 5
            console.log('test')
            const data = 5
            function test() {
                const<I> a = 1;</I>
                const<I> b = 5;</I>
                const<I> c = 10;</I>
                return true
            }
        `
        const codeToRewrite = dedent`
            function test() {
                const a = 1;
                const b = 5;
                const c = 10;
                return true
            }
        `
        const prediction = dedent`
            function test() {
                const a = 1;
                const
                const
                return true
            }
        `
        assertShouldFilterPrediction({
            documentTextWithChanges: text,
            codeToRewrite,
            prediction,
            expectedFilterValue: true,
        })
    })

    it('should not filter prediction when non latest change is reverted', () => {
        const text = dedent`
            const a = 5
            console.log('test')
            const data = 5
            function test() {
                const<I> b = 5;</I>
                const<I> c = 10;</I>
                return true
            }
        `
        const codeToRewrite = dedent`
            function test() {
                const b = 5;
                const c = 10;
                return true
            }
        `
        const prediction = dedent`
            function test() {
                const
                const c = 10;
                return true
            }
        `
        assertShouldFilterPrediction({
            documentTextWithChanges: text,
            codeToRewrite,
            prediction,
            expectedFilterValue: false,
        })
    })

    it('should not filter edits with new line changes by user', () => {
        const text = dedent`
            const a = 5
            <I>console.log('test');</I>
            <I>const data = 10;</I>
            function main() {
                return true
            }
        `
        const codeToRewrite = dedent`
            const a = 5
            console.log('test');
            const data = 10;
            function main() {
                return true
            }
        `
        const prediction = dedent`
            const a = 5
            function main() {
                return true
            }
        `

        assertShouldFilterPrediction({
            documentTextWithChanges: text,
            codeToRewrite,
            prediction,
            expectedFilterValue: false,
        })
    })

    it('should not filter unrelated change', () => {
        const text = dedent`
            const a = 5
            <IC>const data =</IC>
            function main() {
                return true
            }
        `
        const codeToRewrite = dedent`
            const a = 5
            const data =
            function main() {
                return true
            }
        `
        const prediction = dedent`
            const a = 5
            const data = 10
            function main() {
                return true
            }
        `

        assertShouldFilterPrediction({
            documentTextWithChanges: text,
            codeToRewrite,
            prediction,
            expectedFilterValue: false,
        })
    })
})
