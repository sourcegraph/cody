import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources'
import * as vscode from 'vscode'
import { GHOST_TEXT_COLOR } from './commands/GhostHintDecorator'
import { VSCodeDocumentHistory } from './completions/context/retrievers/jaccard-similarity/history'
import { extractXMLFromAnthropicResponse } from './minion/util'
import { RecentEditsRetriever } from './supercompletions/recent-edits/recent-edits-retriever'

const suggesterType = vscode.window.createTextEditorDecorationType({
    before: { color: GHOST_TEXT_COLOR },
    after: { color: GHOST_TEXT_COLOR },
})

export class Completer implements vscode.Disposable {
    private anthropic: Anthropic
    private disposables: vscode.Disposable[] = []
    private recentEditHistory: RecentEditsRetriever
    private history: VSCodeDocumentHistory

    /**
     * If defined, this is the currently active proposed change
     */
    private proposedChange?: {
        changes: vscode.TextEdit[]
        noChangeMessage?: string
    }

    constructor(anthropicKey: string) {
        this.anthropic = new Anthropic({ apiKey: anthropicKey })
        this.recentEditHistory = new RecentEditsRetriever(5 * 60 * 1000)
        this.history = new VSCodeDocumentHistory()

        this.disposables.push(this.recentEditHistory)
        this.disposables.push(
            vscode.commands.registerCommand(
                'cody.supersuggest.accept',
                () => this.acceptProposedChange(),
                this.disposables
            )
        )
        this.disposables.push(
            vscode.commands.registerCommand(
                'cody.supersuggest.dismiss',
                () => this.dismissProposedChange(),
                this.disposables
            )
        )
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(async event => {
                await this.dismissProposedChange()
            }),
            vscode.window.onDidChangeActiveTextEditor(async () => {
                await this.dismissProposedChange()
            })
        )
    }

    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
    private async showNoChangeMessageAtCursor(noChangeMessage: string) {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }

        const position = editor.selection.active
        const lineLength = editor.document.lineAt(position.line).text.length
        const range = new vscode.Range(position.line, 0, position.line, lineLength)

        this.proposedChange = {
            changes: [],
            noChangeMessage,
        }
        editor.setDecorations(suggesterType, [
            {
                range,
                renderOptions: {
                    after: {
                        contentText: noChangeMessage,
                        color: GHOST_TEXT_COLOR,
                        fontStyle: 'italic',
                    },
                },
            },
        ])
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    private async showProposedChange(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!editor || !this.proposedChange) {
            return
        }

        const decorations: vscode.DecorationOptions[] = []

        for (const change of this.proposedChange.changes) {
            // TODO(beyang): what if we're at the end of the file?
            const rangeText = editor.document.getText(change.range)
            const replacementCode = change.newText

            const replacementLines = replacementCode.split('\n')
            const originalLines = rangeText.split('\n')
            const decorationLines: string[] = []
            let changed = false
            for (let i = 0; i < Math.max(originalLines.length, replacementLines.length); i++) {
                if (i >= originalLines.length) {
                    decorationLines.push(replacementLines[i])
                } else if (i >= replacementLines.length) {
                    decorationLines.push('')
                } else {
                    if (originalLines[i].trim() !== replacementLines[i].trim()) {
                        decorationLines.push(replacementLines[i])
                        changed = true
                    } else {
                        decorationLines.push('')
                    }
                }
            }

            if (!changed) {
                await this.showNoChangeMessageAtCursor('Cody: no suggested changes')
                return
            }

            const lineRanges: vscode.Range[] = []
            for (
                let i = change.range.start.line;
                i < change.range.start.line + decorationLines.length;
                i++
            ) {
                const lineText = editor.document.lineAt(i).text
                const lineRange = new vscode.Range(
                    new vscode.Position(i, 0),
                    new vscode.Position(i, lineText.length)
                )
                lineRanges.push(lineRange)
            }

            decorations.push(
                ...lineRanges.map((range, i) => ({
                    range,
                    renderOptions: {
                        after: {
                            contentText: decorationLines[i],
                        },
                    },
                }))
            )
        }

        editor.setDecorations(suggesterType, decorations)
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    async acceptProposedChange(): Promise<void> {
        if (!this.proposedChange) {
            return
        }
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }

        if (!this.proposedChange.noChangeMessage) {
            await editor.edit(editBuilder => {
                for (const edit of this.proposedChange?.changes ?? []) {
                    editBuilder.replace(edit.range, edit.newText)
                }
            })
        }

        await this.dismissProposedChange()
    }

    async dismissProposedChange(): Promise<void> {
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)
        this.proposedChange = undefined
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        editor.setDecorations(suggesterType, [])
    }

    private async getRelevantDiffs(): Promise<string[]> {
        const recentFiles = this.history.lastN(2)
        const diffs = await Promise.all(
            recentFiles.map(f => this.recentEditHistory.getDiff(f.document.uri))
        )
        const diffStrings: string[] = []
        for (const diff of diffs) {
            if (diff) {
                diffStrings.push(diff.toString())
            }
        }
        return diffStrings
    }

    async triggerComplete(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }

        const position = editor.selection.active
        const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
            'vscode.executeFoldingRangeProvider',
            editor.document.uri
        )

        if (!foldingRanges) {
            return
        }

        let currentFoldingRange = null
        for (const range of foldingRanges) {
            if (range.start <= position.line && position.line <= range.end) {
                if (
                    !currentFoldingRange ||
                    range.end - range.start < currentFoldingRange.end - currentFoldingRange.start
                ) {
                    currentFoldingRange = range
                }
            }
        }

        if (!currentFoldingRange) {
            return
        }

        const maxRangeLines = 10
        let truncatedFoldingRange = currentFoldingRange
        if (currentFoldingRange.end - currentFoldingRange.start > 2 * maxRangeLines) {
            const cursorLine = position.line
            const startLine = Math.max(currentFoldingRange.start, cursorLine - maxRangeLines)
            const endLine = Math.min(currentFoldingRange.end, cursorLine + maxRangeLines)

            truncatedFoldingRange = new vscode.FoldingRange(startLine, endLine)
        }

        const truncatedRange = new vscode.Range(
            new vscode.Position(truncatedFoldingRange.start, 0),
            new vscode.Position(
                truncatedFoldingRange.end + 1,
                editor.document.lineAt(truncatedFoldingRange.end + 1).text.length
            )
        )
        const rangeText = editor.document.getText(truncatedRange)
        const recentEdits = await this.getRelevantDiffs()
        const userMessages = nextEditUser([recentEdits.toString()], rangeText)

        console.log('### REQUEST', userMessages[0].content)

        const messages = await this.anthropic.messages.create({
            system: nextEditSystem,
            max_tokens: 1_000,
            temperature: 0,
            model: 'claude-3-5-sonnet-20240620',
            messages: userMessages,
        })

        console.log('### RESPONSE', messages.content[0].text)

        const replacementCode = extractXMLFromAnthropicResponse(messages, 'replacementCode', {
            trimPrefix: 'newline',
            trimSuffix: 'newline',
        })

        this.proposedChange = { changes: [new vscode.TextEdit(truncatedRange, replacementCode)] }
        await this.showProposedChange()
    }
}

const nextEditSystem = `
Your job is to take a list of recent changes to a file and propose a change to the current block of code at the user's cursor. The input format is:
<diff>
hunk 1
</diff>
<diff>
hunk 2
</diff>
<codeToEdit>
the code you should replace
</codeToEdit>

Your output should be in this format:
<replacementCode>
the code that replaces the codeToEdit block
</replacementCode>

NOTE: there may be no changes necessary and it is okay to not suggest any changes.
`.trim()

function nextEditUser(changes: string[], codeToEdit: string): MessageParam[] {
    const text = `
${changes.map(change =>
    `
<diff>
${change}
</diff>
`.trimStart()
)}
<codeToEdit>
${codeToEdit}
</codeToEdit>
`.trimStart()

    return [
        {
            role: 'user',
            content: text,
        },
    ]
}
