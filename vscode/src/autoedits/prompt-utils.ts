import { type AutoEditsTokenLimit, PromptString, ps } from '@sourcegraph/cody-shared'
import { Uri } from 'vscode'
import * as vscode from 'vscode'
import type {
    AutocompleteContextSnippet,
    DocumentContext,
} from '../../../lib/shared/src/completions/types'
import { RetrieverIdentifier } from '../completions/context/utils'
import { autoeditsLogger } from './logger'
import { clip, splitLinesKeepEnds } from './utils'
const LINT_ERRORS_TAG_OPEN = ps`<lint_errors>`
const LINT_ERRORS_TAG_CLOSE = ps`</lint_errors>`
const EXTRACTED_CODE_SNIPPETS_TAG_OPEN = ps`<extracted_code_snippets>`
const EXTRACTED_CODE_SNIPPETS_TAG_CLOSE = ps`</extracted_code_snippets>`
const SNIPPET_TAG_OPEN = ps`<snippet>`
const SNIPPET_TAG_CLOSE = ps`</snippet>`
const RECENT_SNIPPET_VIEWS_TAG_OPEN = ps`<recently_viewed_snippets>`
const RECENT_SNIPPET_VIEWS_TAG_CLOSE = ps`</recently_viewed_snippets>`
const RECENT_EDITS_TAG_OPEN = ps`<diff_history>`
const RECENT_EDITS_TAG_CLOSE = ps`</diff_history>`
const RECENT_COPY_TAG_OPEN = ps`<recent_copy>`
const RECENT_COPY_TAG_CLOSE = ps`</recent_copy>`
const FILE_TAG_OPEN = ps`<file>`
const FILE_TAG_CLOSE = ps`</file>`
const AREA_FOR_CODE_MARKER = ps`<<<AREA_AROUND_CODE_TO_REWRITE_WILL_BE_INSERTED_HERE>>>`
const AREA_FOR_CODE_MARKER_OPEN = ps`<area_around_code_to_rewrite>`
const AREA_FOR_CODE_MARKER_CLOSE = ps`</area_around_code_to_rewrite>`
const CODE_TO_REWRITE_TAG_OPEN = ps`<code_to_rewrite>`
const CODE_TO_REWRITE_TAG_CLOSE = ps`</code_to_rewrite>`

// Some common prompt instructions
export const SYSTEM_PROMPT = ps`You are an intelligent programmer named CodyBot. You are an expert at coding. Your goal is to help your colleague finish a code change.`
const BASE_USER_PROMPT = ps`Help me finish a coding change. In particular, you will see a series of snippets from current open files in my editor, files I have recently viewed, the file I am editing, then a history of my recent codebase changes, then current compiler and linter errors, content I copied from my codebase. You will then rewrite the <code_to_rewrite>, to match what you think I would do next in the codebase. Note: I might have stopped in the middle of typing.`
const FINAL_USER_PROMPT = ps`Now, continue where I left off and finish my change by rewriting "code_to_rewrite":`
const RECENT_VIEWS_INSTRUCTION = ps`Here are some snippets of code I have recently viewed, roughly from oldest to newest. It's possible these aren't entirely relevant to my code change:\n`
const JACCARD_SIMILARITY_INSTRUCTION = ps`Here are some snippets of code I have extracted from open files in my code editor. It's possible these aren't entirely relevant to my code change:\n`
const RECENT_EDITS_INSTRUCTION = ps`Here is my recent series of edits from oldest to newest.\n`
const LINT_ERRORS_INSTRUCTION = ps`Here are some linter errors from the code that you will rewrite.\n`
const RECENT_COPY_INSTRUCTION = ps`Here is some recent code I copied from the editor.\n`
const CURRENT_FILE_INSTRUCTION = ps`Here is the file that I am looking at `

export interface CurrentFilePromptOptions {
    docContext: DocumentContext
    document: vscode.TextDocument
    position: vscode.Position
    maxPrefixLinesInArea: number
    maxSuffixLinesInArea: number
    codeToRewritePrefixLines: number
    codeToRewriteSuffixLines: number
}

export interface CodeToReplaceData {
    codeToRewrite: string
    prefixBeforeArea: string
    suffixAfterArea: string
    prefixInArea: string
    suffixInArea: string
    codeToRewritePrefix: string
    codeToRewriteSuffix: string
    range: vscode.Range
}

export interface CurrentFilePromptResponse {
    fileWithMarkerPrompt: PromptString
    areaPrompt: PromptString
    codeToReplace: CodeToReplaceData
}

interface CurrentFileContext {
    codeToRewrite: PromptString
    codeToRewritePrefix: PromptString
    codeToRewriteSuffix: PromptString
    prefixInArea: PromptString
    suffixInArea: PromptString
    prefixBeforeArea: PromptString
    suffixAfterArea: PromptString
    range: vscode.Range
}

// Helper function to get prompt in some format
export function getBaseUserPrompt(
    docContext: DocumentContext,
    document: vscode.TextDocument,
    position: vscode.Position,
    context: AutocompleteContextSnippet[],
    tokenBudget: AutoEditsTokenLimit
): {
    codeToReplace: CodeToReplaceData
    prompt: PromptString
} {
    const contextItemMapping = getContextItemMappingWithTokenLimit(
        context,
        tokenBudget.contextSpecificTokenLimit
    )
    const { fileWithMarkerPrompt, areaPrompt, codeToReplace } = getCurrentFilePromptComponents({
        docContext,
        document,
        position,
        maxPrefixLinesInArea: tokenBudget.maxPrefixLinesInArea,
        maxSuffixLinesInArea: tokenBudget.maxSuffixLinesInArea,
        codeToRewritePrefixLines: tokenBudget.codeToRewritePrefixLines,
        codeToRewriteSuffixLines: tokenBudget.codeToRewriteSuffixLines,
    })
    const recentViewsPrompt = getPromptForTheContextSource(
        contextItemMapping.get(RetrieverIdentifier.RecentViewPortRetriever) || [],
        RECENT_VIEWS_INSTRUCTION,
        getRecentlyViewedSnippetsPrompt
    )

    const recentEditsPrompt = getPromptForTheContextSource(
        contextItemMapping.get(RetrieverIdentifier.RecentEditsRetriever) || [],
        RECENT_EDITS_INSTRUCTION,
        getRecentEditsPrompt
    )

    const lintErrorsPrompt = getPromptForTheContextSource(
        contextItemMapping.get(RetrieverIdentifier.DiagnosticsRetriever) || [],
        LINT_ERRORS_INSTRUCTION,
        getLintErrorsPrompt
    )

    const recentCopyPrompt = getPromptForTheContextSource(
        contextItemMapping.get(RetrieverIdentifier.RecentCopyRetriever) || [],
        RECENT_COPY_INSTRUCTION,
        getRecentCopyPrompt
    )

    const jaccardSimilarityPrompt = getPromptForTheContextSource(
        contextItemMapping.get(RetrieverIdentifier.JaccardSimilarityRetriever) || [],
        JACCARD_SIMILARITY_INSTRUCTION,
        getJaccardSimilarityPrompt
    )
    const finalPrompt = ps`${BASE_USER_PROMPT}
${jaccardSimilarityPrompt}
${recentViewsPrompt}
${CURRENT_FILE_INSTRUCTION}${fileWithMarkerPrompt}
${recentEditsPrompt}
${lintErrorsPrompt}
${recentCopyPrompt}
${areaPrompt}
${FINAL_USER_PROMPT}
`
    autoeditsLogger.logDebug('AutoEdits', 'Prompt\n', finalPrompt)
    return {
        codeToReplace: codeToReplace,
        prompt: finalPrompt,
    }
}

export function getPromptForTheContextSource(
    contextItems: AutocompleteContextSnippet[],
    instructionPrompt: PromptString,
    callback: (contextItems: AutocompleteContextSnippet[]) => PromptString
): PromptString {
    const prompt = callback(contextItems)
    if (contextItems.length === 0 || prompt.length === 0) {
        return ps``
    }
    return ps`${instructionPrompt}${prompt}\n`
}

//  Prompt components helper functions
export function getCurrentFilePromptComponents(
    options: CurrentFilePromptOptions
): CurrentFilePromptResponse {
    const currentFileContext = getCurrentFileContext(options)
    const codeToReplace = {
        codeToRewrite: currentFileContext.codeToRewrite.toString(),
        range: currentFileContext.range,
        codeToRewritePrefix: currentFileContext.codeToRewritePrefix.toString(),
        codeToRewriteSuffix: currentFileContext.codeToRewriteSuffix.toString(),
        prefixBeforeArea: currentFileContext.prefixBeforeArea.toString(),
        suffixAfterArea: currentFileContext.suffixAfterArea.toString(),
        prefixInArea: currentFileContext.prefixInArea.toString(),
        suffixInArea: currentFileContext.suffixInArea.toString(),
    }

    const fileWithMarker = ps`${currentFileContext.prefixBeforeArea}
${AREA_FOR_CODE_MARKER}
${currentFileContext.suffixAfterArea}`

    const filePrompt = getContextPromptWithPath(
        PromptString.fromDisplayPath(options.document.uri),
        ps`${FILE_TAG_OPEN}
${fileWithMarker}
${FILE_TAG_CLOSE}
`
    )

    const areaPrompt = ps`${AREA_FOR_CODE_MARKER_OPEN}
${currentFileContext.prefixInArea}
${CODE_TO_REWRITE_TAG_OPEN}
${currentFileContext.codeToRewrite}
${CODE_TO_REWRITE_TAG_CLOSE}
${currentFileContext.suffixInArea}
${AREA_FOR_CODE_MARKER_CLOSE}
`
    return { fileWithMarkerPrompt: filePrompt, areaPrompt: areaPrompt, codeToReplace: codeToReplace }
}

export function getCurrentFileContext(options: CurrentFilePromptOptions): CurrentFileContext {
    // Calculate line numbers for different sections
    const { position, document, docContext } = options

    const numContextLines = splitLinesKeepEnds(docContext.prefix + docContext.suffix).length
    const numPrefixLines = splitLinesKeepEnds(docContext.prefix).length
    const adjustment = position.character !== 0 ? 1 : 0

    const minLine = clip(position.line - numPrefixLines + adjustment, 0, document.lineCount - 1)
    const maxLine = clip(minLine + numContextLines - 1, 0, document.lineCount - 1)

    const codeToRewriteStart = clip(position.line - options.codeToRewritePrefixLines, minLine, maxLine)
    const codeToRewriteEnd = clip(position.line + options.codeToRewriteSuffixLines, minLine, maxLine)
    const areaStart = clip(
        position.line - options.maxPrefixLinesInArea - options.codeToRewritePrefixLines,
        minLine,
        maxLine
    )
    const areaEnd = clip(
        position.line + options.maxSuffixLinesInArea + options.codeToRewriteSuffixLines,
        minLine,
        maxLine
    )

    // Helper function to create position from line number
    const positionAtLineStart = (line: number) => new vscode.Position(line, 0)
    const positionAtLineEnd = (line: number) => document.lineAt(line).rangeIncludingLineBreak.end

    // Create ranges for different sections
    const ranges = {
        codeToRewrite: new vscode.Range(
            positionAtLineStart(codeToRewriteStart),
            positionAtLineEnd(codeToRewriteEnd)
        ),
        codeToRewritePrefix: new vscode.Range(
            positionAtLineStart(codeToRewriteStart),
            new vscode.Position(position.line, position.character)
        ),
        codeToRewriteSuffix: new vscode.Range(
            new vscode.Position(position.line, position.character),
            positionAtLineEnd(codeToRewriteEnd)
        ),
        prefixInArea: new vscode.Range(
            positionAtLineStart(areaStart),
            positionAtLineStart(codeToRewriteStart)
        ),
        suffixInArea: new vscode.Range(positionAtLineEnd(codeToRewriteEnd), positionAtLineEnd(areaEnd)),
        prefixBeforeArea: new vscode.Range(positionAtLineStart(minLine), positionAtLineStart(areaStart)),
        suffixAfterArea: new vscode.Range(positionAtLineEnd(areaEnd), positionAtLineEnd(maxLine)),
    }
    // Convert ranges to PromptStrings
    return {
        codeToRewrite: PromptString.fromDocumentText(document, ranges.codeToRewrite),
        codeToRewritePrefix: PromptString.fromDocumentText(document, ranges.codeToRewritePrefix),
        codeToRewriteSuffix: PromptString.fromDocumentText(document, ranges.codeToRewriteSuffix),
        prefixInArea: PromptString.fromDocumentText(document, ranges.prefixInArea),
        suffixInArea: PromptString.fromDocumentText(document, ranges.suffixInArea),
        prefixBeforeArea: PromptString.fromDocumentText(document, ranges.prefixBeforeArea),
        suffixAfterArea: PromptString.fromDocumentText(document, ranges.suffixAfterArea),
        range: ranges.codeToRewrite,
    }
}

export function getLintErrorsPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
    const lintErrors = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.DiagnosticsRetriever
    )
    if (lintErrors.length === 0) {
        return ps``
    }

    // Create a mapping of URI to AutocompleteContextSnippet[]
    const uriToSnippetsMap = new Map<string, AutocompleteContextSnippet[]>()
    for (const item of lintErrors) {
        const uriString = item.uri.toString()
        if (!uriToSnippetsMap.has(uriString)) {
            uriToSnippetsMap.set(uriString, [])
        }
        uriToSnippetsMap.get(uriString)!.push(item)
    }

    // Combine snippets for each URI
    const combinedPrompts: PromptString[] = []
    for (const [uriString, snippets] of uriToSnippetsMap) {
        const uri = Uri.parse(uriString)
        const snippetContents = snippets.map(
            item => PromptString.fromAutocompleteContextSnippet(item).content
        )
        const combinedContent = PromptString.join(snippetContents, ps`\n\n`)
        const promptWithPath = getContextPromptWithPath(
            PromptString.fromDisplayPath(uri),
            combinedContent
        )
        combinedPrompts.push(promptWithPath)
    }

    const lintErrorsPrompt = PromptString.join(combinedPrompts, ps`\n`)
    return ps`${LINT_ERRORS_TAG_OPEN}
${lintErrorsPrompt}
${LINT_ERRORS_TAG_CLOSE}
`
}

export function getRecentCopyPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
    const recentCopy = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.RecentCopyRetriever
    )
    if (recentCopy.length === 0) {
        return ps``
    }
    const recentCopyPrompts = recentCopy.map(item =>
        getContextPromptWithPath(
            PromptString.fromDisplayPath(item.uri),
            PromptString.fromAutocompleteContextSnippet(item).content
        )
    )
    const recentCopyPrompt = PromptString.join(recentCopyPrompts, ps`\n`)
    return ps`${RECENT_COPY_TAG_OPEN}
${recentCopyPrompt}
${RECENT_COPY_TAG_CLOSE}
`
}

export function getRecentEditsPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
    const recentEdits = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.RecentEditsRetriever
    )
    recentEdits.reverse()
    if (recentEdits.length === 0) {
        return ps``
    }
    const recentEditsPrompts = recentEdits.map(item =>
        getContextPromptWithPath(
            PromptString.fromDisplayPath(item.uri),
            PromptString.fromAutocompleteContextSnippet(item).content
        )
    )
    const recentEditsPrompt = PromptString.join(recentEditsPrompts, ps`\n`)
    return ps`${RECENT_EDITS_TAG_OPEN}
${recentEditsPrompt}
${RECENT_EDITS_TAG_CLOSE}
`
}

export function getRecentlyViewedSnippetsPrompt(
    contextItems: AutocompleteContextSnippet[]
): PromptString {
    const recentViewedSnippets = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.RecentViewPortRetriever
    )
    recentViewedSnippets.reverse()
    if (recentViewedSnippets.length === 0) {
        return ps``
    }
    const recentViewedSnippetPrompts = recentViewedSnippets.map(
        item =>
            ps`${SNIPPET_TAG_OPEN}
${getContextPromptWithPath(
    PromptString.fromDisplayPath(item.uri),
    PromptString.fromAutocompleteContextSnippet(item).content
)}
${SNIPPET_TAG_CLOSE}
`
    )
    const snippetsPrompt = PromptString.join(recentViewedSnippetPrompts, ps`\n`)
    return ps`${RECENT_SNIPPET_VIEWS_TAG_OPEN}
${snippetsPrompt}
${RECENT_SNIPPET_VIEWS_TAG_CLOSE}
`
}

export function getJaccardSimilarityPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
    const jaccardSimilarity = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.JaccardSimilarityRetriever
    )
    if (jaccardSimilarity.length === 0) {
        return ps``
    }
    const jaccardSimilarityPrompts = jaccardSimilarity.map(
        item =>
            ps`${SNIPPET_TAG_OPEN}
${getContextPromptWithPath(
    PromptString.fromDisplayPath(item.uri),
    PromptString.fromAutocompleteContextSnippet(item).content
)}
${SNIPPET_TAG_CLOSE}
`
    )
    const snippetsPrompt = PromptString.join(jaccardSimilarityPrompts, ps`\n`)
    return ps`${EXTRACTED_CODE_SNIPPETS_TAG_OPEN}
${snippetsPrompt}
${EXTRACTED_CODE_SNIPPETS_TAG_CLOSE}
`
}

//  Helper functions
export function getContextItemMappingWithTokenLimit(
    contextItems: AutocompleteContextSnippet[],
    contextTokenLimitMapping: Record<string, number>
): Map<RetrieverIdentifier, AutocompleteContextSnippet[]> {
    const contextItemMapping = new Map<RetrieverIdentifier, AutocompleteContextSnippet[]>()
    // Group items by identifier
    for (const item of contextItems) {
        const identifier = item.identifier as RetrieverIdentifier
        if (!contextItemMapping.has(identifier)) {
            contextItemMapping.set(identifier, [])
        }
        contextItemMapping.get(identifier)!.push(item)
    }
    // Apply token limits
    for (const [identifier, items] of contextItemMapping) {
        const tokenLimit =
            identifier in contextTokenLimitMapping ? contextTokenLimitMapping[identifier] : undefined
        if (tokenLimit !== undefined) {
            contextItemMapping.set(identifier, getContextItemsInTokenBudget(items, tokenLimit))
        } else {
            autoeditsLogger.logDebug('AutoEdits', `No token limit for ${identifier}`)
            contextItemMapping.set(identifier, [])
        }
    }
    return contextItemMapping
}

function getContextItemsInTokenBudget(
    contextItems: AutocompleteContextSnippet[],
    tokenBudget: number
): AutocompleteContextSnippet[] {
    const CHARS_PER_TOKEN = 4
    let currentCharsCount = 0
    const charsBudget = tokenBudget * CHARS_PER_TOKEN
    for (let i = 0; i < contextItems.length; i++) {
        currentCharsCount += contextItems[i].content.length
        if (currentCharsCount > charsBudget) {
            return contextItems.slice(0, i)
        }
    }
    return contextItems
}

function getContextItemsForIdentifier(
    contextItems: AutocompleteContextSnippet[],
    identifier: string
): AutocompleteContextSnippet[] {
    return contextItems.filter(item => item.identifier === identifier)
}

function getContextPromptWithPath(filePath: PromptString, content: PromptString): PromptString {
    return ps`(\`${filePath}\`)\n\n${content}\n`
}
