import { testFileUri } from '@sourcegraph/cody-shared'

import { paramsWithInlinedCompletion } from '../../get-inline-completions-tests/helpers'

const prefixLines = getConsoleLogLines('prefix line', 100)
const suffixLines = getConsoleLogLines('suffix line', 100)

export const completionParams = paramsWithInlinedCompletion(
    `${prefixLines}
    function myFunction() {
        console.log(1)
        console.log(2)
        console.log(3)
        console.log(4)
        █
    }
    ${suffixLines}`,
    { documentUri: testFileUri('codebase/test.ts') }
)!

export const contextSnippets = [
    {
        uri: testFileUri('codebase/context1.ts'),
        content: 'function contextSnippetOne() {}',
        startLine: 1,
        endLine: 2,
    },
    {
        uri: testFileUri('codebase/context2.ts'),
        content: 'const contextSnippet2 = {}',
        startLine: 1,
        endLine: 2,
    },
    {
        uri: testFileUri('codebase/context3.ts'),
        content: 'interface ContextParams {}',
        startLine: 1,
        endLine: 2,
        symbol: 'ContextParams',
    },
]

function getConsoleLogLines(message: string, count: number): string {
    return Array.from({ length: count }, (_, index) => {
        return `console.log(${message}: ${index + 1})`
    }).join('\n')
}
