import {
    type AutocompleteContextSnippet,
    type DocumentContext,
    PromptString,
    ps,
    tokensToChars,
} from '@sourcegraph/cody-shared'
import { Uri } from 'vscode'
import * as vscode from 'vscode'
import { getTextFromNotebookCells } from '../../completions/context/retrievers/recent-user-actions/notebook-utils'
import {
    getActiveNotebookUri,
    getCellIndexInActiveNotebookEditor,
    getNotebookCells,
} from '../../completions/context/retrievers/recent-user-actions/notebook-utils'
import { RetrieverIdentifier } from '../../completions/context/utils'
import { autoeditsLogger } from '../logger'
import { clip, splitLinesKeepEnds } from '../utils'
import * as constants from './constants'

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
    filePath: PromptString
    codeToRewrite: PromptString
    codeToRewritePrefix: PromptString
    codeToRewriteSuffix: PromptString
    prefixInArea: PromptString
    suffixInArea: PromptString
    prefixBeforeArea: PromptString
    suffixAfterArea: PromptString
    range: vscode.Range
}

export function getCompletionsPromptWithSystemPrompt(
    systemPrompt: PromptString,
    userPrompt: PromptString
): PromptString {
    // The models are offline fine-tuned on this prompt. It is important to keep it consistent.
    return ps`${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`
}

export function getPromptWithNewline(prompt: PromptString): PromptString {
    if (prompt.length === 0) {
        return ps``
    }
    return ps`${prompt}\n`
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
    return ps`${instructionPrompt}\n${prompt}`
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
    } satisfies CodeToReplaceData

    const fileWithMarker = joinPromptsWithNewlineSeperator(
        currentFileContext.prefixBeforeArea,
        constants.AREA_FOR_CODE_MARKER,
        currentFileContext.suffixAfterArea
    )

    const filePrompt = getCurrentFileContextPromptWithPath(
        currentFileContext.filePath,
        joinPromptsWithNewlineSeperator(
            constants.FILE_TAG_OPEN,
            fileWithMarker,
            constants.FILE_TAG_CLOSE
        )
    )

    const areaPrompt = joinPromptsWithNewlineSeperator(
        constants.AREA_FOR_CODE_MARKER_OPEN,
        currentFileContext.prefixInArea,
        constants.CODE_TO_REWRITE_TAG_OPEN,
        currentFileContext.codeToRewrite,
        constants.CODE_TO_REWRITE_TAG_CLOSE,
        currentFileContext.suffixInArea,
        constants.AREA_FOR_CODE_MARKER_CLOSE
    )

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
    const { prefixBeforeArea, suffixAfterArea } = getUpdatedCurrentFilePrefixAndSuffixOutsideArea(
        document,
        ranges.prefixBeforeArea,
        ranges.suffixAfterArea
    )

    // Convert ranges to PromptStrings
    return {
        filePath: getCurrentFilePath(document),
        codeToRewrite: PromptString.fromDocumentText(document, ranges.codeToRewrite),
        codeToRewritePrefix: PromptString.fromDocumentText(document, ranges.codeToRewritePrefix),
        codeToRewriteSuffix: PromptString.fromDocumentText(document, ranges.codeToRewriteSuffix),
        prefixInArea: PromptString.fromDocumentText(document, ranges.prefixInArea),
        suffixInArea: PromptString.fromDocumentText(document, ranges.suffixInArea),
        prefixBeforeArea,
        suffixAfterArea,
        range: ranges.codeToRewrite,
    }
}

export function getCurrentFilePath(document: vscode.TextDocument): PromptString {
    const uri =
        document.uri.scheme === 'vscode-notebook-cell'
            ? getActiveNotebookUri() ?? document.uri
            : document.uri
    return PromptString.fromDisplayPath(uri)
}

export function getUpdatedCurrentFilePrefixAndSuffixOutsideArea(
    document: vscode.TextDocument,
    rangePrefixBeforeArea: vscode.Range,
    rangeSuffixAfterArea: vscode.Range
): {
    prefixBeforeArea: PromptString
    suffixAfterArea: PromptString
} {
    const { prefixBeforeAreaForNotebook, suffixAfterAreaForNotebook } =
        getPrefixAndSuffixForAreaForNotebook(document)

    const prefixBeforeArea = ps`${prefixBeforeAreaForNotebook}${PromptString.fromDocumentText(
        document,
        rangePrefixBeforeArea
    )}`

    const suffixAfterArea = ps`${PromptString.fromDocumentText(
        document,
        rangeSuffixAfterArea
    )}${suffixAfterAreaForNotebook}`

    return {
        prefixBeforeArea,
        suffixAfterArea,
    }
}

export function getPrefixAndSuffixForAreaForNotebook(document: vscode.TextDocument): {
    prefixBeforeAreaForNotebook: PromptString
    suffixAfterAreaForNotebook: PromptString
} {
    const currentCellIndex = getCellIndexInActiveNotebookEditor(document)
    if (currentCellIndex === -1) {
        return {
            prefixBeforeAreaForNotebook: ps``,
            suffixAfterAreaForNotebook: ps``,
        }
    }
    const activeNotebook = vscode.window.activeNotebookEditor?.notebook!
    const notebookCells = getNotebookCells(activeNotebook)
    const cellsBeforeCurrentCell = notebookCells.slice(0, currentCellIndex)
    const cellsAfterCurrentCell = notebookCells.slice(currentCellIndex + 1)
    const beforeContent = getTextFromNotebookCells(activeNotebook, cellsBeforeCurrentCell)
    const afterContent = getTextFromNotebookCells(activeNotebook, cellsAfterCurrentCell)
    return {
        prefixBeforeAreaForNotebook: ps`${beforeContent}\n`,
        suffixAfterAreaForNotebook: ps`\n${afterContent}`,
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

    const lintErrorsPrompt = PromptString.join(combinedPrompts, ps`\n\n`)
    return joinPromptsWithNewlineSeperator(
        constants.LINT_ERRORS_TAG_OPEN,
        lintErrorsPrompt,
        constants.LINT_ERRORS_TAG_CLOSE
    )
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
    const recentCopyPrompt = PromptString.join(recentCopyPrompts, ps`\n\n`)
    return joinPromptsWithNewlineSeperator(
        constants.RECENT_COPY_TAG_OPEN,
        recentCopyPrompt,
        constants.RECENT_COPY_TAG_CLOSE
    )
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
        getRecentEditsContextPromptWithPath(
            PromptString.fromDisplayPath(item.uri),
            PromptString.fromAutocompleteContextSnippet(item).content
        )
    )
    const recentEditsPrompt = PromptString.join(recentEditsPrompts, ps`\n`)
    return joinPromptsWithNewlineSeperator(
        constants.RECENT_EDITS_TAG_OPEN,
        recentEditsPrompt,
        constants.RECENT_EDITS_TAG_CLOSE
    )
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
    const recentViewedSnippetPrompts = recentViewedSnippets.map(item =>
        joinPromptsWithNewlineSeperator(
            constants.SNIPPET_TAG_OPEN,
            getContextPromptWithPath(
                PromptString.fromDisplayPath(item.uri),
                PromptString.fromAutocompleteContextSnippet(item).content
            ),
            constants.SNIPPET_TAG_CLOSE
        )
    )

    const snippetsPrompt = PromptString.join(recentViewedSnippetPrompts, ps`\n`)
    return joinPromptsWithNewlineSeperator(
        constants.RECENT_SNIPPET_VIEWS_TAG_OPEN,
        snippetsPrompt,
        constants.RECENT_SNIPPET_VIEWS_TAG_CLOSE
    )
}

export function getJaccardSimilarityPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
    const jaccardSimilarity = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.JaccardSimilarityRetriever
    )
    if (jaccardSimilarity.length === 0) {
        return ps``
    }
    const jaccardSimilarityPrompts = jaccardSimilarity.map(item =>
        joinPromptsWithNewlineSeperator(
            constants.SNIPPET_TAG_OPEN,
            getContextPromptWithPath(
                PromptString.fromDisplayPath(item.uri),
                PromptString.fromAutocompleteContextSnippet(item).content
            ),
            constants.SNIPPET_TAG_CLOSE
        )
    )

    const snippetsPrompt = PromptString.join(jaccardSimilarityPrompts, ps`\n`)

    return joinPromptsWithNewlineSeperator(
        constants.EXTRACTED_CODE_SNIPPETS_TAG_OPEN,
        snippetsPrompt,
        constants.EXTRACTED_CODE_SNIPPETS_TAG_CLOSE
    )
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

export function getContextItemsInTokenBudget(
    contextItems: AutocompleteContextSnippet[],
    tokenBudget: number
): AutocompleteContextSnippet[] {
    const autocompleteItemsWithBudget: AutocompleteContextSnippet[] = []
    let currentCharsCount = 0
    const charsBudget = tokensToChars(tokenBudget)

    for (let i = 0; i < contextItems.length; i++) {
        const item = contextItems[i]
        if (currentCharsCount + item.content.length > charsBudget) {
            continue
        }
        currentCharsCount += item.content.length
        autocompleteItemsWithBudget.push(item)
    }
    return autocompleteItemsWithBudget
}

export function getContextItemsForIdentifier(
    contextItems: AutocompleteContextSnippet[],
    identifier: string
): AutocompleteContextSnippet[] {
    return contextItems.filter(item => item.identifier === identifier)
}

export function getContextPromptWithPath(filePath: PromptString, content: PromptString): PromptString {
    return ps`(\`${filePath}\`)\n\n${content}`
}

export function getCurrentFileContextPromptWithPath(
    filePath: PromptString,
    content: PromptString
): PromptString {
    return ps`(\`${filePath}\`)\n${content}`
}

export function getRecentEditsContextPromptWithPath(
    filePath: PromptString,
    content: PromptString
): PromptString {
    return ps`${filePath}\n${content}`
}

export function joinPromptsWithNewlineSeperator(...args: PromptString[]): PromptString {
    return PromptString.join(args, ps`\n`)
}
