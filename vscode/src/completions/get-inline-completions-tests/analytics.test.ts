import { omit } from 'lodash'
import * as uuid from 'uuid'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { resetParsersCache } from '../../tree-sitter/parser'
import * as CompletionLogger from '../logger'
import type { CompletionBookkeepingEvent } from '../logger'
import { initTreeSitterParser } from '../test-helpers'

import { Response } from 'node-fetch'
import { getInlineCompletions, params } from './helpers'

describe('[getInlineCompletions] completion event', () => {
    beforeAll(async () => {
        await initTreeSitterParser()
    })

    afterAll(() => {
        resetParsersCache()
    })

    async function getAnalyticsEvent(
        code: string,
        completion: string,
        additionalParams: { isDotComUser?: boolean } = {}
    ): Promise<CompletionBookkeepingEvent> {
        vi.spyOn(uuid, 'v4').mockImplementation(() => 'stable-uuid')
        const spy = vi.spyOn(CompletionLogger, 'loaded')

        const response = new Response(code, {
            status: 200,
            headers: {
                'x-cody-resolved-model': 'sourcegraph/gateway-model',
                'fireworks-speculation-matched-tokens': '100',
            },
        })

        await getInlineCompletions(
            params(
                code,
                [
                    {
                        completionResponse: {
                            completion,
                            stopReason: 'unit-test',
                        },
                        metadata: {
                            response,
                        },
                    },
                ],
                additionalParams
            )
        )

        // Get `suggestionId` from `CompletionLogger.loaded` call.
        const suggestionId: CompletionLogger.CompletionLogID = spy.mock.calls[0][0].logId
        const completionEvent = CompletionLogger.getCompletionEvent(suggestionId)!

        return completionEvent
    }

    function eventWithoutTimestamps(
        event: CompletionBookkeepingEvent
    ): Partial<CompletionBookkeepingEvent> {
        return omit(event, [
            'acceptedAt',
            'loadedAt',
            'networkRequestStartedAt',
            'startLoggedAt',
            'startedAt',
            'suggestedAt',
            'suggestionAnalyticsLoggedAt',
            'suggestionLoggedAt',
            'params.contextSummary.duration',
            'params.stageTimings',
        ])
    }

    describe('fills all the expected fields on `CompletionLogger.loaded` calls', () => {
        it('for multiLine completions', async () => {
            const event = await getAnalyticsEvent(
                'function foo() {█}',
                'console.log(bar)\nreturn false}'
            )

            expect(Object.keys(event.params.stageTimings)).toMatchInlineSnapshot(`
              [
                "preLastCandidate",
                "preCache",
                "preDebounce",
                "preContextRetrieval",
                "preNetworkRequest",
              ]
            `)

            expect(eventWithoutTimestamps(event)).toMatchInlineSnapshot(`
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
                      "lastAncestorOnTheSameLine": "function_declaration",
                      "parent": "statement_block",
                    },
                    "nodeTypesWithCompletion": {
                      "atCursor": "{",
                      "grandparent": "function_declaration",
                      "greatGrandparent": "program",
                      "lastAncestorOnTheSameLine": "function_declaration",
                      "parent": "statement_block",
                    },
                    "parseErrorCount": 0,
                    "stopReason": undefined,
                    "truncatedWith": "tree-sitter",
                  },
                ],
                "loggedPartialAcceptedLength": 0,
                "params": {
                  "artificialDelay": undefined,
                  "completionIntent": "function.body",
                  "contextSummary": {
                    "prefixChars": 16,
                    "retrieverStats": {},
                    "strategy": "none",
                    "suffixChars": 1,
                    "totalChars": 17,
                  },
                  "id": "stable-uuid",
                  "isFuzzyMatch": false,
                  "languageId": "typescript",
                  "multiline": true,
                  "multilineMode": "block",
                  "providerIdentifier": "anthropic",
                  "providerModel": "anthropic/claude-instant-1.2",
                  "resolvedModel": "sourcegraph/gateway-model",
                  "responseHeaders": {
                    "fireworks-speculation-matched-tokens": "100",
                  },
                  "source": "Network",
                  "testFile": false,
                  "traceId": undefined,
                  "triggerKind": "Automatic",
                },
                "read": false,
              }
            `)
        })

        it('for singleline completions', async () => {
            const event = await getAnalyticsEvent('function foo() {\n  return█}', '"foo"')

            expect(Object.keys(event.params.stageTimings)).toMatchInlineSnapshot(`
              [
                "preLastCandidate",
                "preCache",
                "preDebounce",
                "preContextRetrieval",
                "preNetworkRequest",
              ]
            `)

            expect(eventWithoutTimestamps(event)).toMatchInlineSnapshot(`
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
                      "lastAncestorOnTheSameLine": "function_declaration",
                      "parent": "return_statement",
                    },
                    "nodeTypesWithCompletion": {
                      "atCursor": "return",
                      "grandparent": "statement_block",
                      "greatGrandparent": "function_declaration",
                      "lastAncestorOnTheSameLine": "return_statement",
                      "parent": "return_statement",
                    },
                    "parseErrorCount": 0,
                    "stopReason": undefined,
                    "truncatedWith": undefined,
                  },
                ],
                "loggedPartialAcceptedLength": 0,
                "params": {
                  "artificialDelay": undefined,
                  "completionIntent": "return_statement",
                  "contextSummary": {
                    "prefixChars": 25,
                    "retrieverStats": {},
                    "strategy": "none",
                    "suffixChars": 1,
                    "totalChars": 26,
                  },
                  "id": "stable-uuid",
                  "isFuzzyMatch": false,
                  "languageId": "typescript",
                  "multiline": false,
                  "multilineMode": null,
                  "providerIdentifier": "anthropic",
                  "providerModel": "anthropic/claude-instant-1.2",
                  "resolvedModel": "sourcegraph/gateway-model",
                  "responseHeaders": {
                    "fireworks-speculation-matched-tokens": "100",
                  },
                  "source": "Network",
                  "testFile": false,
                  "traceId": undefined,
                  "triggerKind": "Automatic",
                },
                "read": false,
              }
            `)
        })

        it('logs `insertText` only for DotCom users', async () => {
            const event = await getAnalyticsEvent('function foo() {\n  return█}', '"foo"')

            expect(event.items?.some(item => item.insertText)).toBe(false)
        })

        it('does not log `insertText` for enterprise users', async () => {
            const event = await getAnalyticsEvent('function foo() {\n  return█}', '"foo"', {
                isDotComUser: true,
            })

            expect(event.items?.some(item => item.insertText)).toBe(true)
        })
        it('does not log `inlineCompletionItemContext` for enterprise users', async () => {
            const event = await getAnalyticsEvent('function foo() {\n  return█}', '"foo"')
            expect(event.params?.inlineCompletionItemContext).toBeUndefined()
        })
    })
})
