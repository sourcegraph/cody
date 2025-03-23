import {
    type AutocompleteContextSnippet,
    type CodeToReplaceData,
    PromptString,
    ps,
} from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { RetrieverIdentifier } from '../../completions/context/utils'
import { AutoeditsUserPromptStrategy } from './base'
import type { UserPromptArgs } from './base'
import {
    getContextItemsForIdentifier,
    getContextItemsInTokenBudget,
    joinPromptsWithNewlineSeparator,
} from './prompt-utils'

export class ZetaLikePromptProvider extends AutoeditsUserPromptStrategy {
    private readonly MAX_EDIT_EVENTS = 16
    private readonly MAX_EDIT_EVENTS_TOKEN_LIMIT = 500

    private readonly CURSOR_MARKER = ps`<|user_cursor_is_here|>`
    private readonly START_OF_FILE_MARKER = ps`<|start_of_file|>`
    private readonly EDITABLE_REGION_START_MARKER = ps`<|editable_region_start|>`
    private readonly EDITABLE_REGION_END_MARKER = ps`<|editable_region_end|>`

    getUserPrompt({ context, codeToReplaceData, document }: UserPromptArgs): PromptString {
        const userEdits = this.getUserEditsPrompt(context)
        const userExcerpt = this.getUserExcerptPrompt(codeToReplaceData, document)
        return this.getPromptAlpacaFormatForAutoedit(userEdits, userExcerpt)
    }

    private getUserExcerptPrompt(
        codeToReplaceData: CodeToReplaceData,
        document: vscode.TextDocument
    ): PromptString {
        const isAtStartOfFile = codeToReplaceData.prefixBeforeArea.toString() === ''
        return this.getUserExcerptPromptWithMarkers(
            document,
            codeToReplaceData.prefixInArea,
            codeToReplaceData.codeToRewritePrefix,
            codeToReplaceData.codeToRewriteSuffix,
            codeToReplaceData.suffixInArea,
            isAtStartOfFile
        )
    }

    private getUserExcerptPromptWithMarkers(
        document: vscode.TextDocument,
        prefixBeforeEditableRegion: string,
        prefixInsideEditableRegion: string,
        suffixInsideEditableRegion: string,
        suffixAfterEditableRegion: string,
        isAtStartOfFile: boolean
    ): PromptString {
        const path = PromptString.fromDisplayPath(document.uri)

        const startFileMarker = ps`\n${this.START_OF_FILE_MARKER}`
        return ps`\`\`\`${path}${isAtStartOfFile ? startFileMarker : ''}
${PromptString.unsafe_fromUserQuery(prefixBeforeEditableRegion)}
${this.EDITABLE_REGION_START_MARKER}
${PromptString.unsafe_fromUserQuery(prefixInsideEditableRegion)}${
    this.CURSOR_MARKER
}${PromptString.unsafe_fromUserQuery(suffixInsideEditableRegion)}
${this.EDITABLE_REGION_END_MARKER}
${PromptString.unsafe_fromUserQuery(suffixAfterEditableRegion)}
\`\`\`
`
    }

    private getUserEditsPrompt(context: AutocompleteContextSnippet[]): PromptString {
        const editItems = getContextItemsForIdentifier(context, RetrieverIdentifier.RecentEditsRetriever)
        const editEvents = getContextItemsInTokenBudget(
            editItems,
            this.MAX_EDIT_EVENTS_TOKEN_LIMIT
        ).slice(0, this.MAX_EDIT_EVENTS)

        // reverse the order of the edit events
        editEvents.reverse()
        const allEditEvents = editEvents.map(this.getUserEditForSingleEditEvent)
        return joinPromptsWithNewlineSeparator(allEditEvents, ps`\n\n`)
    }

    private getUserEditForSingleEditEvent(event: AutocompleteContextSnippet): PromptString {
        const path = PromptString.fromDisplayPath(event.uri)
        event.content = event.content.split('\n').slice(2).join('\n')
        const edit = PromptString.fromAutocompleteContextSnippet(event).content
        return ps`User edited ${path}:\n\`\`\`diff\n${edit}\n\`\`\``
    }

    private getPromptAlpacaFormatForAutoedit(
        userEdits: PromptString,
        userExcerpt: PromptString
    ): PromptString {
        return ps`Below is an instruction that describes a task, paired with an input that provides further context. Write a response that appropriately completes the request.

### Instruction:
You are a code completion assistant and your task is to analyze user edits and then rewrite an excerpt that the user provides, suggesting the appropriate edits within the excerpt, taking into account the cursor location.

### Events:
${userEdits}

### Input:
${userExcerpt}

### Response:
`
    }

    public updatePrediction({ prediction }: { prediction: string }): string {
        // Remove the cursor marker.
        const cursorMarker = this.CURSOR_MARKER.toString()
        const content = prediction.replace(cursorMarker, '')

        const startMarker = this.EDITABLE_REGION_START_MARKER.toString()
        const endMarker = this.EDITABLE_REGION_END_MARKER.toString()
        const sofMarker = this.START_OF_FILE_MARKER.toString()

        // Helper function to count occurrences of a substring.
        const countOccurrences = (str: string, sub: string): number => {
            return str.split(sub).length - 1
        }

        const startOccurrences = countOccurrences(content, startMarker)
        if (startOccurrences !== 1) {
            throw new Error(`expected exactly one start marker, found ${startOccurrences}`)
        }

        const endOccurrences = countOccurrences(content, endMarker)
        if (endOccurrences !== 1) {
            throw new Error(`expected exactly one end marker, found ${endOccurrences}`)
        }

        const sofOccurrences = countOccurrences(content, sofMarker)
        if (sofOccurrences > 1) {
            throw new Error(`expected at most one start-of-file marker, found ${sofOccurrences}`)
        }

        // Find the location of the start marker.
        const codeFenceStart = content.indexOf(startMarker)
        if (codeFenceStart === -1) {
            throw new Error('Start marker not found in prediction.')
        }

        // Slice the string starting from the start marker.
        const sliced = content.substring(codeFenceStart)
        // Find the first newline in the sliced string (i.e. end of the start marker's line).
        const newlineIndex = sliced.indexOf('\n')
        if (newlineIndex === -1) {
            throw new Error('could not find newline after start marker')
        }
        // Everything after this newline is our candidate content.
        const slicedAfterNewline = sliced.substring(newlineIndex + 1)

        // Look for the end marker which should be preceded by a newline.
        const endMarkerWithNewline = '\n' + endMarker
        const codeFenceEnd = slicedAfterNewline.lastIndexOf(endMarkerWithNewline)
        if (codeFenceEnd === -1) {
            throw new Error('could not find end marker preceded by a newline')
        }

        const newText = slicedAfterNewline.substring(0, codeFenceEnd)
        return newText
    }
}
