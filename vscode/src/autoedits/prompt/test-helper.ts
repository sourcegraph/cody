import dedent from 'dedent'

import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import { type CodeToReplaceData, getCodeToReplaceData } from '../prompt/prompt-utils'

interface CodeToReplaceTestOptions {
    maxPrefixLength: number
    maxSuffixLength: number
    maxPrefixLinesInArea: number
    maxSuffixLinesInArea: number
    codeToRewritePrefixLines: number
    codeToRewriteSuffixLines: number
}

export function createCodeToReplaceDataForTest(
    code: TemplateStringsArray | string,
    options: CodeToReplaceTestOptions,
    ...values: unknown[]
): CodeToReplaceData {
    const documentText = isTemplateStringsArray(code) ? dedent(code, values) : code.toString()
    const { document, position } = documentAndPosition(documentText)
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: options.maxPrefixLength,
        maxSuffixLength: options.maxSuffixLength,
    })

    return getCodeToReplaceData({
        docContext,
        position,
        document,
        tokenBudget: options,
    })
}

export function getCodeToReplaceForRenderer(
    code: TemplateStringsArray,
    ...values: unknown[]
): CodeToReplaceData {
    return createCodeToReplaceDataForTest(
        code,
        {
            maxPrefixLength: 100,
            maxSuffixLength: 100,
            maxPrefixLinesInArea: 2,
            maxSuffixLinesInArea: 2,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 1,
        },
        ...values
    )
}

export function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
    return Array.isArray(value) && 'raw' in value && Array.isArray(value.raw)
}
