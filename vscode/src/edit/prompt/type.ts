import type {
    CompletionParameters,
    EditModel,
    Message,
    PromptString,
    Rule,
} from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { FixupTask } from '../../non-stop/FixupTask'

export interface BuildInteractionOptions {
    model: EditModel
    codyApiVersion: number
    contextWindow: number
    task: FixupTask
    editor: VSCodeEditor
}

export interface BuiltInteraction extends Pick<CompletionParameters, 'stopSequences'> {
    messages: Message[]
    responseTopic: string
    responsePrefix?: string
}

export interface EditPromptBuilder {
    buildInteraction(options: BuildInteractionOptions): Promise<BuiltInteraction>
}

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
    rules?: Rule[] | null
}

type LLMInteractionBuilder = (options: GetLLMInteractionOptions) => LLMInteraction

export interface EditLLMInteraction {
    getEdit: LLMInteractionBuilder
    getDoc: LLMInteractionBuilder
    getFix: LLMInteractionBuilder
    getAdd: LLMInteractionBuilder
    getTest: LLMInteractionBuilder
}
