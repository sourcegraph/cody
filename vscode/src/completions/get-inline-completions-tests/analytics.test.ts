import { omit } from 'lodash'
import * as uuid from 'uuid'
import { describe, expect, it, vi } from 'vitest'

import * as CompletionLogger from '../logger'
import { initTreeSitterParser } from '../test-helpers'

import { getInlineCompletions, params } from './helpers'

describe('[getInlineCompletions] completion event', () => {
    it('fills all the expected fields on `CompletionLogger.loaded` calls', async () => {
        await initTreeSitterParser()
        vi.spyOn(uuid, 'v4').mockImplementation(() => 'stable-uuid')
        const spy = vi.spyOn(CompletionLogger, 'loaded')

        await getInlineCompletions(
            params('function foo() {█}', [
                {
                    completion: 'console.log(bar)\nreturn false}',
                    stopReason: 'unit-test',
                },
            ])
        )

        // Get `suggestionId` from `CompletionLogger.loaded` call.
        const suggestionId: CompletionLogger.SuggestionID = spy.mock.calls[0][0]
        const completionEvent = CompletionLogger.getCompletionEvent(suggestionId!)

        const eventWithoutTimestamps = omit(completionEvent, [
            'acceptedAt',
            'loadedAt',
            'networkRequestStartedAt',
            'startLoggedAt',
            'startedAt',
            'suggestedAt',
            'suggestionAnalyticsLoggedAt',
            'suggestionLoggedAt',
        ])

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
            "params": {
              "contextSummary": undefined,
              "id": "stable-uuid",
              "languageId": "typescript",
              "multiline": true,
              "multilineMode": "block",
              "providerIdentifier": "anthropic",
              "providerModel": "claude-instant-infill",
              "triggerKind": "Automatic",
              "type": "inline",
            },
          }
        `)
    })
})
