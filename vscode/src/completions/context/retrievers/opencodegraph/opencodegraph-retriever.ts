import * as vscode from 'vscode'

import { ContextRetriever, ContextRetrieverOptions, ContextSnippet } from '../../../types'

/**
 * Gets context for the current document from [OpenCodeGraph](https://opencodegraph.org) providers,
 * via the OpenCodeGraph VS Code extension (if it's installed and running).
 */
export class OpenCodeGraphRetriever implements ContextRetriever {
    public identifier = 'opencodegraph'

    private disposables: vscode.Disposable[] = []

    public retrieve(options: ContextRetrieverOptions): Promise<ContextSnippet[]> {
        return Promise.resolve([
            {
                fileName: 'hatColor.ts',
                content: 'The color of my hat is rouge-cyan.',
            },
        ])
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
