import { type CodeToReplaceData, PromptString, ps } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import * as constants from '../constants'
import { getCurrentFilePath, joinPromptsWithNewlineSeparator, trimNewLineCharIfExists } from './common'

export function getCurrentFilePromptComponents({
    document,
    codeToReplaceDataRaw,
    includeCursor,
}: {
    document: vscode.TextDocument
    codeToReplaceDataRaw: CodeToReplaceData
    includeCursor?: boolean
}): {
    fileWithMarkerPrompt: PromptString
    areaPrompt: PromptString
} {
    const filePath = getCurrentFilePath(document)
    const codeToReplaceData = PromptString.fromAutoEditCodeToReplaceData(
        codeToReplaceDataRaw,
        document.uri
    )

    const fileWithMarker = joinPromptsWithNewlineSeparator([
        codeToReplaceData.prefixBeforeArea,
        constants.AREA_FOR_CODE_MARKER,
        codeToReplaceData.suffixAfterArea,
    ])

    const fileWithMarkerPrompt = getCurrentFileContextPromptWithPath(
        filePath,
        joinPromptsWithNewlineSeparator([
            constants.FILE_TAG_OPEN,
            fileWithMarker,
            constants.FILE_TAG_CLOSE,
        ])
    )

    const codeToRewrite = includeCursor
        ? ps`${codeToReplaceData.codeToRewritePrefix}<CURSOR_IS_HERE>${codeToReplaceData.codeToRewriteSuffix}`
        : codeToReplaceData.codeToRewrite

    const areaPrompt = joinPromptsWithNewlineSeparator([
        constants.AREA_FOR_CODE_MARKER_OPEN,
        codeToReplaceData.prefixInArea,
        constants.CODE_TO_REWRITE_TAG_OPEN,
        codeToRewrite,
        constants.CODE_TO_REWRITE_TAG_CLOSE,
        codeToReplaceData.suffixInArea,
        constants.AREA_FOR_CODE_MARKER_CLOSE,
    ])

    return {
        fileWithMarkerPrompt,
        areaPrompt,
    }
}

export function getCurrentFileLongSuggestionPrompt({
    document,
    codeToReplaceDataRaw,
}: {
    document: vscode.TextDocument
    codeToReplaceDataRaw: CodeToReplaceData
    includeCursor?: boolean
}): PromptString {
    const filePath = getCurrentFilePath(document)
    const codeToReplaceData = PromptString.fromAutoEditCodeToReplaceData(
        codeToReplaceDataRaw,
        document.uri
    )

    const prefix = ps`${codeToReplaceData.prefixBeforeArea}${codeToReplaceData.prefixInArea}`
    const codeToRewrite = ps`${codeToReplaceData.codeToRewritePrefix}${constants.LONG_SUGGESTION_USER_CURSOR_MARKER}${codeToReplaceData.codeToRewriteSuffix}`
    const suffix = ps`${codeToReplaceData.suffixInArea}${codeToReplaceData.suffixAfterArea}`

    const areaPrompt = joinPromptsWithNewlineSeparator([
        trimNewLineCharIfExists(prefix),
        constants.LONG_SUGGESTION_EDITABLE_REGION_START_MARKER,
        trimNewLineCharIfExists(codeToRewrite),
        constants.LONG_SUGGESTION_EDITABLE_REGION_END_MARKER,
        trimNewLineCharIfExists(suffix),
    ])

    const fileWithMarkerPrompt = getCurrentFileContextPromptWithPath(
        filePath,
        joinPromptsWithNewlineSeparator([constants.FILE_TAG_OPEN, areaPrompt, constants.FILE_TAG_CLOSE])
    )
    return fileWithMarkerPrompt
}

function getCurrentFileContextPromptWithPath(
    filePath: PromptString,
    content: PromptString
): PromptString {
    return ps`(\`${filePath}\`)\n${content}`
}
