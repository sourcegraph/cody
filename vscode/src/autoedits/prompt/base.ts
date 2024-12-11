import type { AutoEditsTokenLimit, PromptString } from '@sourcegraph/cody-shared'
import type {
    AutocompleteContextSnippet,
    DocumentContext,
} from '@sourcegraph/cody-shared/src/completions/types'
import type * as vscode from 'vscode'
import type { CodeToReplaceData } from './prompt-utils'

export interface UserPromptArgs {
    docContext: DocumentContext
    document: vscode.TextDocument
    position: vscode.Position
    context: AutocompleteContextSnippet[]
    tokenBudget: AutoEditsTokenLimit
}

export interface UserPromptResponse {
    codeToReplace: CodeToReplaceData
    prompt: PromptString
}

/**
 * Interface for generating user prompts in auto-edits functionality.
 * The major difference between different strategy is the prompt rendering.
 */
export interface AutoeditsUserPromptStrategy {
    /**
     * Generates a prompt string based on the provided arguments.
     * @param args - The arguments containing document context, position, and token budget.
     * @returns A promise that resolves to a prompt string.
     */
    getUserPrompt(args: UserPromptArgs): UserPromptResponse
}
