import dedent from 'dedent'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import { type CodeToReplaceData, getCurrentFilePromptComponents } from '../prompt/prompt-utils'

export function createCodeToReplaceDataForTest(
    code: TemplateStringsArray,
    ...values: unknown[]
): CodeToReplaceData {
    const { document, position } = documentAndPosition(dedent(code, values))
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 100,
        maxSuffixLength: 100,
    })

    return getCurrentFilePromptComponents({
        docContext,
        position,
        document,
        maxPrefixLinesInArea: 2,
        maxSuffixLinesInArea: 2,
        codeToRewritePrefixLines: 1,
        codeToRewriteSuffixLines: 1,
    }).codeToReplace
}
