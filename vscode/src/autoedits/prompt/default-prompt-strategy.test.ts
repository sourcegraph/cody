import type { AutoEditsTokenLimit } from '@sourcegraph/cody-shared'
import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared/src/completions/types'
import { describe, expect, it } from 'vitest'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import { DefaultUserPromptStrategy } from './default-prompt-strategy'

describe('DefaultUserPromptStrategy', () => {
    const promptProvider = new DefaultUserPromptStrategy()

    it('creates a prompt in the correct format', () => {
        const prefix = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n')
        const suffix = Array.from({ length: 50 }, (_, i) => `line ${50 + i + 1}`).join('\n')
        const textContent = `${prefix}█\n${suffix}`

        const { document, position } = documentAndPosition(textContent)
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const tokenBudget: AutoEditsTokenLimit = {
            prefixTokens: 10,
            suffixTokens: 10,
            maxPrefixLinesInArea: 20,
            maxSuffixLinesInArea: 20,
            codeToRewritePrefixLines: 3,
            codeToRewriteSuffixLines: 3,
            contextSpecificTokenLimit: {},
        }
        const context: AutocompleteContextSnippet[] = []
        const { prompt } = promptProvider.getUserPrompt({
            docContext,
            document,
            position,
            context,
            tokenBudget,
        })

        const expectedPrompt =
            `Help me finish a coding change. In particular, you will see a series of snippets from current open files in my editor, files I have recently viewed, the file I am editing, then a history of my recent codebase changes, then current compiler and linter errors, content I copied from my codebase. You will then rewrite the <code_to_rewrite>, to match what you think I would do next in the codebase. Note: I might have stopped in the middle of typing.


Here is the file that I am looking at (` +
            '`' +
            'test.ts' +
            '`' +
            `)

<file>

<<<AREA_AROUND_CODE_TO_REWRITE_WILL_BE_INSERTED_HERE>>>

</file>





<area_around_code_to_rewrite>
line 37
line 38
line 39
line 40
line 41
line 42
line 43
line 44
line 45
line 46

<code_to_rewrite>
line 47
line 48
line 49
line 50
line 51
line 52
line 53

</code_to_rewrite>
line 54
line 55
line 56
line 57
line 58
line 59
line 60
line 61
line 62
line 63
line 64

</area_around_code_to_rewrite>

Now, continue where I left off and finish my change by rewriting "code_to_rewrite":
`
        expect(prompt.toString()).toEqual(expectedPrompt)
    })
})
