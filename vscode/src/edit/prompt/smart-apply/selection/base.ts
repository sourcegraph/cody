import {
    type ChatClient,
    type EditModel,
    type Message,
    type ModelContextWindow,
    type PromptString,
    ps,
} from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'

export interface SelectionPromptProviderArgs {
    instruction: PromptString
    replacement: PromptString
    document: vscode.TextDocument
    model: EditModel
    contextWindow: ModelContextWindow
    codyApiVersion: number
    chatClient: ChatClient
}

export interface SelectionPromptProviderResult {
    prefix: string
    messages: Message[]
}

export interface SmartApplySelectionProvider {
    getSelectedText(args: SelectionPromptProviderArgs): Promise<string>
}

export const SMART_APPLY_TOPICS = {
    INSTRUCTION: ps`INSTRUCTION`,
    FILE_CONTENTS: ps`FILE_CONTENTS`,
    INCOMING: ps`INCOMING`,
    REPLACE: ps`REPLACE`,
} as const

// TODO: This is Claude specific right now, we should expand and test
// this with OpenAI LLMs before opening this up to enterprise.
export const LLM_PARAMETERS = {
    stopSequences: [`</${SMART_APPLY_TOPICS.REPLACE}>`],
    assistantPrefix: ps`<${SMART_APPLY_TOPICS.REPLACE}>`,
}
