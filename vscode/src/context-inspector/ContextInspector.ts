import * as vscode from 'vscode'

import { ContextInspectorRecord } from '@sourcegraph/cody-shared/src/chat/context-inspector/context-inspector'

import { ContextDecorator } from './ContextDecorator'
import { PromptDocumentProvider } from './PromptDocumentProvider'

export class ContextInspector implements vscode.Disposable {
    private readonly contextDecorator = new ContextDecorator()
    private readonly promptDocumentProvider = new PromptDocumentProvider()

    public dispose(): void {
        this.contextDecorator.dispose()
        this.promptDocumentProvider.dispose()
    }

    public didUseContext(records: readonly ContextInspectorRecord[]): void {
        this.contextDecorator.didUseContext(records)
        // TODO: pass in the serialized prompt here for the prompt document
    }
}
