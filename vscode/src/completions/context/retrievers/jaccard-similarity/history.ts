import { FeatureFlag, featureFlagProvider, subscriptionDisposable } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { type ShouldUseContextParams, shouldBeUsedAsContext } from '../../utils'

interface HistoryItem {
    document: Pick<vscode.TextDocument, 'uri' | 'languageId'>
}

export interface DocumentHistory {
    addItem(newItem: HistoryItem): void
    lastN(n: number, languageId?: string, ignoreUris?: vscode.Uri[]): HistoryItem[]
}

export class VSCodeDocumentHistory implements DocumentHistory, vscode.Disposable {
    private window = 50

    // tracks history in chronological order (latest at the end of the array)
    private history: HistoryItem[]

    private subscriptions: vscode.Disposable[] = []
    public enableExtendedLanguagePool = false

    constructor(
        register: () => vscode.Disposable | null = () =>
            vscode.window.onDidChangeActiveTextEditor(event => {
                if (!event?.document.uri) {
                    return
                }
                this.addItem({
                    document: event.document,
                })
            })
    ) {
        this.history = []
        if (register) {
            const disposable = register()
            if (disposable) {
                this.subscriptions.push(disposable)
            }
        }

        this.subscriptions.push(
            subscriptionDisposable(
                featureFlagProvider
                    .evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteContextExtendLanguagePool)
                    .subscribe(resolvedFlag => {
                        this.enableExtendedLanguagePool = Boolean(resolvedFlag)
                    })
            )
        )
    }

    public dispose(): void {
        vscode.Disposable.from(...this.subscriptions).dispose()
    }

    public addItem(newItem: HistoryItem): void {
        if (newItem.document.uri.scheme === 'codegen') {
            return
        }
        const foundIndex = this.history.findIndex(
            item => item.document.uri.toString() === newItem.document.uri.toString()
        )
        if (foundIndex >= 0) {
            this.history = [...this.history.slice(0, foundIndex), ...this.history.slice(foundIndex + 1)]
        }
        this.history.push(newItem)
        if (this.history.length > this.window) {
            this.history.shift()
        }
    }

    /**
     * Returns the last n items of history in reverse chronological order (latest item at the front)
     */
    public lastN(n: number, baseLanguageId: string, ignoreUris?: vscode.Uri[]): HistoryItem[] {
        const ret: HistoryItem[] = []
        const ignoreSet = new Set(ignoreUris || [])
        for (let i = this.history.length - 1; i >= 0; i--) {
            const item = this.history[i]
            if (ret.length > n) {
                break
            }
            if (ignoreSet.has(item.document.uri)) {
                continue
            }
            const params: ShouldUseContextParams = {
                enableExtendedLanguagePool: this.enableExtendedLanguagePool,
                baseLanguageId: baseLanguageId,
                languageId: item.document.languageId,
            }
            if (shouldBeUsedAsContext(params)) {
                continue
            }
            ret.push(item)
        }
        return ret
    }
}
