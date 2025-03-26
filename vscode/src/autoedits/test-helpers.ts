import { vi } from 'vitest'
import type * as vscode from 'vscode'

import type { ChatClient } from '@sourcegraph/cody-shared'

import { versionedDocumentAndPosition } from '../completions/test-helpers'
import { defaultVSCodeExtensionClient } from '../extension-client'
import { FixupController } from '../non-stop/FixupController'
import { WorkspaceEdit, vsCodeMocks } from '../testutils/mocks'

import type { CodyStatusBar } from '../services/StatusBar'
import * as adapters from './adapters/utils'
import { autoeditTriggerKind } from './analytics-logger'
import {
    AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS,
    AutoeditsProvider,
    type AutoeditsResult,
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
        documentVersion = 1,
        provider: existingProvider,
        getModelResponse,
        isAutomaticTimersAdvancementDisabled = false,
    }: {
        prediction: string
        documentVersion?: number
        /** provide to reuse an existing provider instance */
        provider?: AutoeditsProvider
        inlineCompletionContext?: vscode.InlineCompletionContext
        getModelResponse?: typeof adapters.getModelResponse
        isAutomaticTimersAdvancementDisabled?: boolean
    }
): Promise<{
    result: AutoeditsResult | null
    promiseResult: Promise<AutoeditsResult | null>
    document: vscode.TextDocument
    position: vscode.Position
    provider: AutoeditsProvider
    editBuilder: WorkspaceEdit
}> {
    const getModelResponseMock: typeof adapters.getModelResponse = async () => {
        // Simulate response latency.
        vi.advanceTimersByTime(100)

        return {
            type: 'success',
            responseBody: {
                choices: [
                    {
                        text: prediction,
                    },
                ],
            },
            requestHeaders: {},
            responseHeaders: {},
            requestUrl: 'test-url.com/completions',
        } as const
    }

    // TODO: add a callback to verify `getModelResponse` arguments.
    vi.spyOn(adapters, 'getModelResponse').mockImplementation(getModelResponse || getModelResponseMock)

    const editBuilder = new WorkspaceEdit()
    const { document, position } = versionedDocumentAndPosition({
        textWithCursor,
        version: documentVersion,
    })

    vi.spyOn(vsCodeMocks.window, 'activeTextEditor', 'get').mockReturnValue({
        document,
        selection: {
            active: position,
        },
        edit: (callback: any) => callback(editBuilder),
        setDecorations: () => {},
    } as any)

    const chatClient = null as unknown as ChatClient
    const extensionClient = defaultVSCodeExtensionClient()
    const fixupController = new FixupController(extensionClient)
    const mockStatusBar = {
        addLoader: vi.fn(),
        init: vi.fn(),
    } as any as CodyStatusBar
    const provider =
        existingProvider ??
        new AutoeditsProvider(chatClient, fixupController, mockStatusBar, { shouldRenderInline: true })

    let result: AutoeditsResult | null = null

    const promiseResult = provider
        .provideInlineCompletionItems(document, position, inlineCompletionContext)
        .then(res => {
            result = res
            return result
        })
        .catch(err => {
            console.error(err)
            return null
        })

    if (!isAutomaticTimersAdvancementDisabled) {
        // Advance time by the default debounce interval.
        await vi.advanceTimersByTimeAsync(AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS)
    }

    return { result, promiseResult, document, position, provider, editBuilder }
}
