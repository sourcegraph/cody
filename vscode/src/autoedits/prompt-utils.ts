import { PromptString, logDebug, ps, psDedent } from '@sourcegraph/cody-shared'
import { Uri } from 'vscode'
import type * as vscode from 'vscode'
import type {
    AutocompleteContextSnippet,
    DocumentContext,
} from '../../../lib/shared/src/completions/types'
import { RetrieverIdentifier } from '../completions/context/utils'

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

export interface CurrentFilePromptOptions {
    docContext: DocumentContext
    document: vscode.TextDocument
    maxPrefixLinesInArea: number
    maxSuffixLinesInArea: number
    codeToRewritePrefixLines: number
    codeToRewriteSuffixLines: number
}

export interface CurrentFilePromptResponse {
    fileWithMarkerPrompt: PromptString
    codeToRewritePrompt: PromptString
}

interface PrefixContext {
    prefixBeforeArea: PromptString
    prefixInArea: PromptString
    codeToRewritePrefix: PromptString
}

interface SuffixContext {
    suffixAfterArea: PromptString
    suffixInArea: PromptString
    codeToRewriteSuffix: PromptString
}

export function getPromptForTheContextSource(
    contextItems: AutocompleteContextSnippet[],
    instructionPrompt: PromptString,
    callback: (contextItems: AutocompleteContextSnippet[]) => PromptString
): PromptString {
    const prompt = callback(contextItems)
    if (prompt === ps``) {
        return ps``
    }
    return ps`${instructionPrompt}${prompt}`
}

//  Prompt components helper functions

export function getCurrentFilePromptComponents(
    options: CurrentFilePromptOptions
): CurrentFilePromptResponse {
    const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(
        options.docContext,
        options.document.uri
    )
    const prefixContext = getPrefixContext(
        prefix,
        options.maxPrefixLinesInArea,
        options.codeToRewritePrefixLines
    )
    const suffixContext = getSuffixContext(
        suffix,
        options.maxSuffixLinesInArea,
        options.codeToRewriteSuffixLines
    )
    const codeToRewrite = PromptString.join(
        [prefixContext.codeToRewritePrefix, suffixContext.codeToRewriteSuffix],
        ps``
    )

    const fileWithMarker = ps`${prefixContext.prefixBeforeArea}${AREA_FOR_CODE_MARKER}\n${suffixContext.suffixAfterArea}`
    const filePrompt = getContextPromptWithPath(
        PromptString.fromDisplayPath(options.document.uri),
        psDedent`
            ${FILE_TAG_OPEN}
            ${fileWithMarker}
            ${FILE_TAG_CLOSE}
        `
    )
    const areaPrompt = psDedent`
        ${AREA_FOR_CODE_MARKER_OPEN}
        ${prefixContext.prefixInArea}
        ${CODE_TO_REWRITE_TAG_OPEN}
        ${codeToRewrite}
        ${CODE_TO_REWRITE_TAG_CLOSE}
        ${suffixContext.suffixInArea}
        ${AREA_FOR_CODE_MARKER_CLOSE}
    `
    return { fileWithMarkerPrompt: filePrompt, codeToRewritePrompt: areaPrompt }
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
    return psDedent`
        ${LINT_ERRORS_TAG_OPEN}
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
    return psDedent`
        ${RECENT_COPY_TAG_OPEN}
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
    return psDedent`
        ${RECENT_EDITS_TAG_OPEN}
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
            psDedent`
            ${SNIPPET_TAG_OPEN}
            ${getContextPromptWithPath(
                PromptString.fromDisplayPath(item.uri),
                PromptString.fromAutocompleteContextSnippet(item).content
            )}
            ${SNIPPET_TAG_CLOSE}
        `
    )
    const snippetsPrompt = PromptString.join(recentViewedSnippetPrompts, ps`\n`)
    return psDedent`
        ${RECENT_SNIPPET_VIEWS_TAG_OPEN}
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
            psDedent`
            ${SNIPPET_TAG_OPEN}
            ${getContextPromptWithPath(
                PromptString.fromDisplayPath(item.uri),
                PromptString.fromAutocompleteContextSnippet(item).content
            )}
            ${SNIPPET_TAG_CLOSE}
        `
    )
    const snippetsPrompt = PromptString.join(jaccardSimilarityPrompts, ps`\n`)
    return psDedent`
        ${EXTRACTED_CODE_SNIPPETS_TAG_OPEN}
        ${snippetsPrompt}
        ${EXTRACTED_CODE_SNIPPETS_TAG_CLOSE}
    `
}

function getPrefixContext(
    prefix: PromptString,
    prefixAreaLinesBudget: number,
    codeToRewritePrefixLines: number
): PrefixContext {
    const prefixLines = prefix.split('\n')
    const totalLines = prefixLines.length

    // Ensure we don't exceed the total number of lines available
    const actualPrefixLinesBudget = Math.min(prefixAreaLinesBudget, totalLines)
    const actualCodeToRewritePrefixLines = Math.min(codeToRewritePrefixLines, actualPrefixLinesBudget)

    // Calculate start indexes for each section
    const codeToRewriteStart = totalLines - actualCodeToRewritePrefixLines
    const prefixInAreaStart =
        codeToRewriteStart - (actualPrefixLinesBudget - actualCodeToRewritePrefixLines)

    // Split the prefix into three parts
    const prefixBeforeArea = PromptString.join(prefixLines.slice(0, prefixInAreaStart), ps`\n`)
    const prefixInArea = PromptString.join(
        prefixLines.slice(prefixInAreaStart, codeToRewriteStart),
        ps`\n`
    )
    const codeToRewritePrefix = PromptString.join(prefixLines.slice(codeToRewriteStart), ps`\n`)

    return {
        prefixBeforeArea: prefixBeforeArea,
        prefixInArea: prefixInArea,
        codeToRewritePrefix: codeToRewritePrefix,
    }
}

function getSuffixContext(
    suffix: PromptString,
    suffixAreaLinesBudget: number,
    codeToRewriteSuffixLines: number
): SuffixContext {
    const suffixLines = suffix.split('\n')
    const totalLines = suffixLines.length

    // Ensure we don't exceed the total number of lines available
    const actualSuffixAreaLinesBudget = Math.min(suffixAreaLinesBudget, totalLines)
    const actualCodeToRewriteSuffixLines = Math.min(
        codeToRewriteSuffixLines,
        actualSuffixAreaLinesBudget
    )

    // Calculate end indexes for each section
    const codeToRewriteEnd = actualCodeToRewriteSuffixLines
    const suffixInAreaEnd = actualSuffixAreaLinesBudget

    // Split the suffix into three parts
    const codeToRewriteSuffix = PromptString.join(suffixLines.slice(0, codeToRewriteEnd), ps`\n`)
    const suffixInArea = PromptString.join(suffixLines.slice(codeToRewriteEnd, suffixInAreaEnd), ps`\n`)
    const suffixAfterArea = PromptString.join(suffixLines.slice(suffixInAreaEnd), ps`\n`)

    return {
        codeToRewriteSuffix: codeToRewriteSuffix,
        suffixInArea: suffixInArea,
        suffixAfterArea: suffixAfterArea,
    }
}

//  Helper functions
export function getContextItemMappingWithTokenLimit(
    contextItems: AutocompleteContextSnippet[],
    contextTokenLimitMapping = new Map<RetrieverIdentifier, number>()
): Record<string, AutocompleteContextSnippet[]> {
    const contextItemMapping = contextItems.reduce(
        (mapping, item) => {
            if (!mapping[item.identifier]) {
                mapping[item.identifier] = []
            }
            mapping[item.identifier].push(item)
            return mapping
        },
        {} as Record<string, AutocompleteContextSnippet[]>
    )

    for (const [identifier, items] of Object.entries(contextItemMapping)) {
        const tokenLimit = contextTokenLimitMapping.get(identifier as RetrieverIdentifier)
        if (tokenLimit !== undefined) {
            contextItemMapping[identifier] = getContextItemsInTokenBudget(items, tokenLimit)
        } else {
            logDebug('AutoEdits', `No token limit for ${identifier}`)
            contextItemMapping[identifier] = []
        }
    }
    return contextItemMapping
}

function getContextItemsInTokenBudget(
    contextItems: AutocompleteContextSnippet[],
    charsBudget: number
): AutocompleteContextSnippet[] {
    let currentCharsCount = 0
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
    return ps`(${filePath})\n\n${content}\n`
}
