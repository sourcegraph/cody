import type { PromptString } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'

export interface LLMPrompt {
    system?: PromptString
    instruction: PromptString
}

export interface LLMInteraction {
    prompt: LLMPrompt
    stopSequences?: string[]
    responseTopic?: PromptString
    assistantText?: PromptString
    assistantPrefix?: PromptString
}

export interface GetLLMInteractionOptions {
    instruction: PromptString
    precedingText: PromptString
    selectedText: PromptString
    followingText: PromptString
    uri: vscode.Uri
    document: vscode.TextDocument
}

type LLMInteractionBuilder = (options: GetLLMInteractionOptions) => LLMInteraction

export interface EditLLMInteraction {
    getEdit: LLMInteractionBuilder
    getDoc: LLMInteractionBuilder
    getFix: LLMInteractionBuilder
    getAdd: LLMInteractionBuilder
    getTest: LLMInteractionBuilder
}
