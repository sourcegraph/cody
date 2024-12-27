import dedent from 'dedent'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import { type CodeToReplaceData, getCurrentFilePromptComponents } from '../prompt/prompt-utils'

interface CodeToReplaceTestOptions {
    maxPrefixLength: number
    maxSuffixLength: number
    maxPrefixLinesInArea: number
    maxSuffixLinesInArea: number
    codeToRewritePrefixLines: number
    codeToRewriteSuffixLines: number
}

export function createCodeToReplaceDataForTest(
    code: TemplateStringsArray,
    options: CodeToReplaceTestOptions,
    ...values: unknown[]
): CodeToReplaceData {
    const { document, position } = documentAndPosition(dedent(code, values))
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: options.maxPrefixLength,
        maxSuffixLength: options.maxSuffixLength,
    })

    return getCurrentFilePromptComponents({
        docContext,
        position,
        document,
        maxPrefixLinesInArea: options.maxPrefixLinesInArea,
        maxSuffixLinesInArea: options.maxSuffixLinesInArea,
        codeToRewritePrefixLines: options.codeToRewritePrefixLines,
        codeToRewriteSuffixLines: options.codeToRewriteSuffixLines,
    }).codeToReplaceData
}
