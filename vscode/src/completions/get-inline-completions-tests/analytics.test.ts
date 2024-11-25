import omit from 'lodash/omit'
import pick from 'lodash/pick'
import { Response } from 'node-fetch'
import * as uuid from 'uuid'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
    AUTH_STATUS_FIXTURE_AUTHED,
    AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'

import type { CodeGenEventMetadata } from '../../services/CharactersLogger'
import { resetParsersCache } from '../../tree-sitter/parser'
import * as CompletionAnalyticsLogger from '../analytics-logger'
import type { CompletionBookkeepingEvent } from '../analytics-logger'
import { initTreeSitterParser } from '../test-helpers'

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
        const spy = vi.spyOn(CompletionAnalyticsLogger, 'loaded')

        const response = new Response(code, {
            status: 200,
            headers: {
                'x-cody-resolved-model': 'sourcegraph/gateway-model',
                'fireworks-speculation-matched-tokens': '100',
            },
        })

        const generateParams = params(
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
            {
                configuration: {
                    configuration: {
                        autocompleteAdvancedProvider: 'fireworks',
                    },
                },
                authStatus: additionalParams.isDotComUser
                    ? AUTH_STATUS_FIXTURE_AUTHED_DOTCOM
                    : AUTH_STATUS_FIXTURE_AUTHED,
            }
        )
        const completionResponse = await getInlineCompletions(generateParams)

        // Get `suggestionId` from `CompletionAnalyticsLogger.loaded` call.
        const suggestionId: CompletionAnalyticsLogger.CompletionLogID = spy.mock.calls[0][0].logId
        const completionEvent = CompletionAnalyticsLogger.getCompletionEvent(suggestionId)!

        CompletionAnalyticsLogger.accepted({
            id: suggestionId,
            document: generateParams.document,
            completion: completionResponse!.items[0],
            trackedRange: undefined,
            isDotComUser: true,
            position: generateParams.position,
        })

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

    describe('fills all the expected fields on `CompletionAnalyticsLogger.loaded` calls', () => {
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
                  "providerIdentifier": "fireworks",
                  "providerModel": "starcoder-hybrid",
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
                  "providerIdentifier": "fireworks",
                  "providerModel": "starcoder-hybrid",
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

        it('does not log `insertText` for enterprise users', async () => {
            const event = await getAnalyticsEvent('function foo() {\n  return█}', '"foo"')

            expect(event.items?.some(item => item.insertText)).toBe(false)
        })

        it('logs `insertText` only for DotCom users', async () => {
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

    describe('fills all the expected fields on `CompletionAnalyticsLogger.accepted` call', async () => {
        it('add character logger metadata to `accepted` events', async () => {
            const recordEventSpy = vi.spyOn(telemetryRecorder, 'recordEvent')

            await getAnalyticsEvent('function foo() {\n  return█}', '"foo"')

            const [feature, action, event] = recordEventSpy.mock.calls.find(
                callArguments => callArguments[1] === 'accepted'
            )! as [string, string, Record<string, unknown>]

            expect(feature).toBe('cody.completion')
            expect(action).toBe('accepted')
            expect(event.metadata).toMatchObject({})

            const characterLoggerMetadata = pick(event.metadata, [
                'isDisjoint',
                'isFullyOutsideOfVisibleRanges',
                'isPartiallyOutsideOfVisibleRanges',
                'isSelectionStale',
                'noActiveTextEditor',
                'outsideOfActiveEditor',
                'windowNotFocused',
            ] satisfies (keyof CodeGenEventMetadata)[])

            expect(characterLoggerMetadata).toMatchInlineSnapshot(`
              {
                "isDisjoint": 0,
                "isFullyOutsideOfVisibleRanges": 1,
                "isPartiallyOutsideOfVisibleRanges": 1,
                "isSelectionStale": 1,
                "noActiveTextEditor": 0,
                "outsideOfActiveEditor": 1,
                "windowNotFocused": 1,
              }
            `)
        })
    })
})
