import { describe, expect, test, vi } from 'vitest'
import type * as vscode from 'vscode'

import { vsCodeMocks } from '../testutils/mocks'

import { getInlineCompletions, InlineCompletionsResultSource } from './getInlineCompletions'
import { createProviderConfig } from './providers/anthropic'
import { documentAndPosition } from './testHelpers'
import { InlineCompletionItem } from './types'
import { InlineCompletionItemProvider } from './vscodeInlineCompletionItemProvider'

vi.mock('vscode', () => ({
    ...vsCodeMocks,
    workspace: {
        ...vsCodeMocks.workspace,
        asRelativePath(path: string) {
            return path
        },
        onDidChangeTextDocument() {
            return null
        },
    },
    window: {
        ...vsCodeMocks.window,
        visibleTextEditors: [],
        tabGroups: { all: [] },
    },
}))

const DUMMY_CONTEXT: vscode.InlineCompletionContext = {
    selectedCompletionInfo: undefined,
    triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
}

class MockableInlineCompletionItemProvider extends InlineCompletionItemProvider {
    constructor(
        mockGetInlineCompletions: typeof getInlineCompletions,
        superArgs?: Partial<ConstructorParameters<typeof InlineCompletionItemProvider>[0]>
    ) {
        super({
            completeSuggestWidgetSelection: false,
            // Most of these are just passed directly to `getInlineCompletions`, which we've mocked, so
            // we can just make them `null`.
            //
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            getCodebaseContext: null as any,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            history: null as any,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            statusBar: null as any,
            providerConfig: createProviderConfig({
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                completionsClient: null as any,
                contextWindowTokens: 2048,
            }),

            ...superArgs,
        })
        this.getInlineCompletions = mockGetInlineCompletions
    }

    public declare lastCandidate
}

describe('InlineCompletionItemProvider', () => {
    test('returns results that span the whole line', async () => {
        const { document, position } = documentAndPosition('const foo = █', 'typescript')
        const fn = vi.fn(getInlineCompletions).mockResolvedValue({
            logId: '1',
            items: [{ insertText: 'test', range: new vsCodeMocks.Range(position, position) }],
            source: InlineCompletionsResultSource.Network,
        })
        const provider = new MockableInlineCompletionItemProvider(fn)
        const { items } = await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
        expect(items).toMatchInlineSnapshot(`
          [
            InlineCompletionItem {
              "insertText": "const foo = test",
              "range": Range {
                "end": Position {
                  "character": 12,
                  "line": 0,
                },
                "start": Position {
                  "character": 0,
                  "line": 0,
                },
              },
            },
          ]
        `)
    })

    test('saves lastInlineCompletionResult', async () => {
        const { document, position } = documentAndPosition('const foo = █', 'typescript')

        const item: InlineCompletionItem = { insertText: 'test', range: new vsCodeMocks.Range(position, position) }
        const fn = vi.fn(getInlineCompletions).mockResolvedValue({
            logId: '1',
            items: [item],
            source: InlineCompletionsResultSource.Network,
        })
        const provider = new MockableInlineCompletionItemProvider(fn)

        // Initially it is undefined.
        expect(provider.lastCandidate).toBeUndefined()

        // No lastInlineCompletionResult is provided on the 1st call.
        await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
        expect(fn.mock.calls.map(call => call[0].lastCandidate)).toEqual([undefined])
        fn.mockReset()

        // But it is returned and saved.
        expect(provider.lastCandidate?.result.items).toEqual([item])

        // On the 2nd call, lastInlineCompletionResult is provided.
        await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
        expect(fn.mock.calls.map(call => call[0].lastCandidate?.result.items)).toEqual([[item]])
    })
})
