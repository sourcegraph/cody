import { omit } from 'lodash'
import * as uuid from 'uuid'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import * as CompletionLogger from '../logger'
import { CompletionEvent } from '../logger'
import { initTreeSitterParser } from '../test-helpers'
import { resetParsersCache } from '../tree-sitter/parser'

import { getInlineCompletions, params } from './helpers'

describe('[getInlineCompletions] completion event', () => {
    beforeAll(async () => {
        await initTreeSitterParser()
    })

    afterAll(() => {
        resetParsersCache()
    })

    async function getAnalyticsEvent(code: string, completion: string): Promise<Partial<CompletionEvent>> {
        vi.spyOn(uuid, 'v4').mockImplementation(() => 'stable-uuid')
        const spy = vi.spyOn(CompletionLogger, 'loaded')

        await getInlineCompletions(
            params(code, [
                {
                    completion,
                    stopReason: 'unit-test',
                },
            ])
        )

        // Get `suggestionId` from `CompletionLogger.loaded` call.
        const suggestionId: CompletionLogger.CompletionLogID = spy.mock.calls[0][0]
        const completionEvent = CompletionLogger.getCompletionEvent(suggestionId)

        return omit(completionEvent, [
            'acceptedAt',
            'loadedAt',
            'networkRequestStartedAt',
            'startLoggedAt',
            'startedAt',
            'suggestedAt',
            'suggestionAnalyticsLoggedAt',
            'suggestionLoggedAt',
            'params.contextSummary.duration',
        ])
    }

    describe('fills all the expected fields on `CompletionLogger.loaded` calls', () => {
        it('for multiLine completions', async () => {
            const eventWithoutTimestamps = await getAnalyticsEvent(
                'function foo() {█}',
                'console.log(bar)\nreturn false}'
            )

            expect(eventWithoutTimestamps).toMatchInlineSnapshot(`
              {
                "id": "stable-uuid",
                "items": [
                  {
                    "charCount": 30,
                    "lineCount": 2,
                    "lineTruncatedCount": 0,
                    "nodeTypes": {
                      "atCursor": "{",
                      "grandparent": "function_declaration",
                      "greatGrandparent": "program",
                      "parent": "statement_block",
                    },
                    "nodeTypesWithCompletion": {
                      "atCursor": "{",
                      "grandparent": "function_declaration",
                      "greatGrandparent": "program",
                      "parent": "statement_block",
                    },
                    "parseErrorCount": 0,
                    "stopReason": "unit-test",
                    "truncatedWith": "tree-sitter",
                  },
                ],
                "loggedPartialAcceptedLength": 0,
                "params": {
                  "completionIntent": "function.body",
                  "contextSummary": {
                    "retrieverStats": {},
                    "strategy": "none",
                    "totalChars": 0,
                  },
                  "id": "stable-uuid",
                  "languageId": "typescript",
                  "multiline": true,
                  "multilineMode": "block",
                  "providerIdentifier": "anthropic",
                  "providerModel": "claude-instant-1.2",
                  "source": "Network",
                  "triggerKind": "Automatic",
                  "type": "inline",
                },
              }
            `)
        })

        it('for singleline completions', async () => {
            const eventWithoutTimestamps = await getAnalyticsEvent('function foo() {\n  return█}', '"foo"')

            expect(eventWithoutTimestamps).toMatchInlineSnapshot(`
              {
                "id": "stable-uuid",
                "items": [
                  {
                    "charCount": 5,
                    "lineCount": 1,
                    "lineTruncatedCount": undefined,
                    "nodeTypes": {
                      "atCursor": "return",
                      "grandparent": "statement_block",
                      "greatGrandparent": "function_declaration",
                      "parent": "return_statement",
                    },
                    "nodeTypesWithCompletion": {
                      "atCursor": "return",
                      "grandparent": "statement_block",
                      "greatGrandparent": "function_declaration",
                      "parent": "return_statement",
                    },
                    "parseErrorCount": 0,
                    "stopReason": "unit-test",
                    "truncatedWith": undefined,
                  },
                ],
                "loggedPartialAcceptedLength": 0,
                "params": {
                  "completionIntent": "return_statement",
                  "contextSummary": {
                    "retrieverStats": {},
                    "strategy": "none",
                    "totalChars": 0,
                  },
                  "id": "stable-uuid",
                  "languageId": "typescript",
                  "multiline": false,
                  "multilineMode": null,
                  "providerIdentifier": "anthropic",
                  "providerModel": "claude-instant-1.2",
                  "source": "Network",
                  "triggerKind": "Automatic",
                  "type": "inline",
                },
              }
            `)
        })
    })
})
