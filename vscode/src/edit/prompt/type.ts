import type * as vscode from 'vscode'

export interface LLMInteraction {
    prompt: string
    stopSequences?: string[]
    responseTopic?: string
    assistantText?: string
    assistantPrefix?: string
}

export interface GetLLMInteractionOptions {
    instruction: string
    precedingText: string
    selectedText: string
    followingText: string
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
