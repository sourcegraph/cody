import { logError } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

interface FoldingRangeStart {
    startLine: number
    indentationLevel: number
}

/**
 * A custom implementation of folding ranges that works with all programming
 * languages by following indentation levels.
 *
 * See agent/src/lsp/foldingRanges.test.ts for test cases. The tests live in the
 * agent/ project so that it has access to the mocked out VS Code APIs.
 */
export class IndentationBasedFoldingRangeProvider implements vscode.FoldingRangeProvider {
    private indentationLevel(text: string): number {
        let indentation = 0
        for (const c of text) {
            if (c === ' ' || c === '\t') {
                indentation++
            } else {
                return indentation
            }
        }
        return indentation
    }
    public provideFoldingRanges(
        document: vscode.TextDocument,
        _context: vscode.FoldingContext,
        _token: vscode.CancellationToken
    ): vscode.FoldingRange[] {
        const result: vscode.FoldingRange[] = []
        try {
            const stack: FoldingRangeStart[] = []
            let previousIndentation = 0
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i)
                let indentation = this.indentationLevel(line.text)
                if (indentation === 0) {
                    indentation = previousIndentation
                }
                if (indentation > previousIndentation) {
                    stack.push({ startLine: Math.max(0, i - 1), indentationLevel: indentation })
                } else if (indentation < previousIndentation) {
                    const start = stack.pop()
                    if (start) {
                        result.push(new vscode.FoldingRange(start.startLine, i))
                    }
                }
                previousIndentation = indentation
            }
            const start = stack.pop()
            if (start) {
                result.push(new vscode.FoldingRange(start.startLine, document.lineCount))
            }
        } catch (error) {
            logError('IndentationBasedFoldingRanges', 'error', error)
        }
        return result
    }
}
