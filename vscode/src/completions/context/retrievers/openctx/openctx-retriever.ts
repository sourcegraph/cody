import * as vscode from 'vscode'

import { isDefined } from '@sourcegraph/cody-shared'

import { getOpenCtxExtensionAPI } from '../../../../context/openctx'
import type {
    ContextRetriever,
    ContextRetrieverOptions,
    ContextSnippet,
    FileContextSnippet,
} from '../../../types'

/**
 * Gets context for the current document from [OpenCtx](https://openctx.org) providers, via the
 * OpenCtx VS Code extension (if it's installed and running).
 */
export class OpenCtxRetriever implements ContextRetriever {
    public identifier = 'openctx'

    private disposables: vscode.Disposable[] = []

    private openctxApi = getOpenCtxExtensionAPI()

    public async retrieve(options: ContextRetrieverOptions): Promise<ContextSnippet[]> {
        const items = await (await this.openctxApi).getItems(options.document)
        const contextSnippets =
            items
                ?.map(item =>
                    // TODO(sqs): hacky
                    item.ai?.content
                        ? ({
                              uri: vscode.Uri.parse(`opencontext://${item.title}.txt`),
                              content: item.ai.content,
                              startLine: 0,
                              endLine: 1,
                          } satisfies FileContextSnippet)
                        : null
                )
                .filter(isDefined) ?? []
        return contextSnippets
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
