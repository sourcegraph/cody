import { vi } from 'vitest'
import type * as vscode from 'vscode'

import type { ChatClient } from '@sourcegraph/cody-shared'

import { documentAndPosition } from '../completions/test-helpers'
import { WorkspaceEdit, vsCodeMocks } from '../testutils/mocks'

import * as adapters from './adapters/utils'
import { autoeditTriggerKind } from './analytics-logger'
import {
    AutoeditsProvider,
    type AutoeditsResult,
    INLINE_COMPLETION_DEFAULT_DEBOUNCE_INTERVAL_MS,
} from './autoedits-provider'

/**
 * A helper to be used for the autoedits integration tests.
 *
 * Creates a mock environment and returns the autoedits result object.
 * Simulates VSCode's text editor, document context, and model responses with
 * configurable prediction text and completion context.
 */
export async function autoeditResultFor(
    textWithCursor: string,
    {
        inlineCompletionContext = {
            triggerKind: autoeditTriggerKind.automatic,
            selectedCompletionInfo: undefined,
        },
        prediction,
        token,
        provider: existingProvider,
    }: {
        prediction: string
        /** provide to reuse an existing provider instance */
        provider?: AutoeditsProvider
        inlineCompletionContext?: vscode.InlineCompletionContext
        token?: vscode.CancellationToken
    }
): Promise<{
    result: AutoeditsResult | null
    document: vscode.TextDocument
    position: vscode.Position
    provider: AutoeditsProvider
    editBuilder: WorkspaceEdit
}> {
    // TODO: add a callback to verify `getModelResponse` arguments.
    vi.spyOn(adapters, 'getModelResponse').mockImplementation(async (..._args: unknown[]) => {
        // Simulate response latency.
        vi.advanceTimersByTime(100)

        return {
            choices: [
                {
                    text: prediction,
                },
            ],
        }
    })

    const editBuilder = new WorkspaceEdit()
    const { document, position } = documentAndPosition(textWithCursor)

    vi.spyOn(vsCodeMocks.window, 'activeTextEditor', 'get').mockReturnValue({
        document,
        edit: (callback: any) => callback(editBuilder),
        setDecorations: () => {},
    } as any)

    const chatClient = null as unknown as ChatClient
    const provider = existingProvider ?? new AutoeditsProvider(chatClient)

    let result: AutoeditsResult | null = null

    provider
        .provideInlineCompletionItems(document, position, inlineCompletionContext, token)
        .then(res => {
            result = res
        })

    // Advance time by the default debounce interval.
    await vi.advanceTimersByTimeAsync(INLINE_COMPLETION_DEFAULT_DEBOUNCE_INTERVAL_MS)

    return { result, document, position, provider, editBuilder }
}
