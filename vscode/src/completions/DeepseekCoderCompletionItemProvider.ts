import { PromptString, createOllamaClient, isAbortError, ps } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getModelHelpers } from './providers/ollama-models'

const OLLAMA_MODEL_ID = 'deepseek-coder-v2'

const output = vscode.window.createOutputChannel('DeepseekCoder')
function log(what: any): void {
    output.appendLine(JSON.stringify(what, null, 2))
}

export class DeepseekCoderCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    private client = createOllamaClient({ model: OLLAMA_MODEL_ID, url: 'http://127.0.0.1:11434' })
    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList> {
        try {
            const result = await this.provideInlineCompletionItemsOrCrash(
                document,
                position,
                context,
                token
            )
            log({ result })
            return result
        } catch (error) {
            if (isAbortError(error)) {
                // Do nothing
            } else if (error instanceof Error) {
                log({ error: error.message, stack: error?.stack })
            }
            return { items: [] }
        }
    }

    private async provideInlineCompletionItemsOrCrash(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList> {
        const windowSize = 100_000
        const before = document
            .getText(new vscode.Range(new vscode.Position(0, 0), position))
            .slice(-windowSize)
        const after = document
            .getText(
                new vscode.Range(
                    position,
                    new vscode.Position(document.lineCount, Number.MAX_SAFE_INTEGER)
                )
            )
            .slice(0, windowSize)
        const modelHelper = getModelHelpers('deepseek-coder')
        const currentFileNameComment = ps`// ${PromptString.fromDisplayPathLineRange(document.uri)}`
        log({ currentFileNameComment })
        const prompt = modelHelper.getPrompt({
            context: ps``,
            currentFileNameComment,
            isInfill: true,
            languageId: 'typescript',
            prefix: PromptString.unsafe_fromUserQuery(before),
            suffix: PromptString.unsafe_fromUserQuery(after),
            snippets: [],
            uri: document.uri,
        })
        const abortController = new AbortController()
        token.onCancellationRequested(() => abortController.abort())
        let insertText = ''
        for await (const part of this.client.complete(
            { model: OLLAMA_MODEL_ID, prompt, template: '{{ .Prompt }}' },
            abortController
        )) {
            insertText = part.completion
        }
        log({ completion: insertText })
        const items: vscode.InlineCompletionItem[] = []
        if (insertText) {
            const range = new vscode.Range(position, position)
            items.push({
                insertText,
                // filterText: completion,
                range: range,
                command: {
                    command: 'cody.highlight-completion',
                    title: 'Highlight',
                    arguments: [{ range, insertText, document }],
                },
            })
        }
        return { items }
    }
}
