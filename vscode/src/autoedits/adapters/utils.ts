import {
    type CompletionsRewriteSpeculationParams,
    type Message,
    type PromptString,
    charsToTokens,
} from '@sourcegraph/cody-shared'
import { isHotStreakEnabled } from '../autoedits-config'
import type { InceptionLabsRequestParams } from './inceptionlabs'

export interface FireworksCompatibleRewriteSpeculationArgs {
    // Rewrite speculation enabled speculating the tokens from predicted outputs even after first token mis-match.
    rewrite_speculation?: boolean
    // Adaptive speculation adjust the length of speculation tokens dynamically.
    adaptive_speculation?: boolean
    // Number of tokens to speculate.
    speculation_length_on_strong_match?: number
    // Minimum number of tokens to speculate.
    speculation_min_length_on_strong_match?: number
    // Speculation threshold.
    speculation_strong_match_threshold?: number
}

export interface FireworksCompatibleRequestParams extends FireworksCompatibleRewriteSpeculationArgs {
    stream: boolean
    model: string
    temperature: number
    max_tokens: number
    response_format: {
        type: string
    }
    prediction: {
        type: string
        content: string
    }
    user?: string
}

export interface FireworksChatMessage {
    role: string
    content: PromptString
}

export interface FireworksChatModelRequestParams extends FireworksCompatibleRequestParams {
    messages: FireworksChatMessage[]
}

export interface FireworksCompletionModelRequestParams extends FireworksCompatibleRequestParams {
    prompt: PromptString
}

export type AutoeditsRequestBody =
    | FireworksChatModelRequestParams
    | FireworksCompletionModelRequestParams
    | InceptionLabsRequestParams

export function getMaxOutputTokensForAutoedits(codeToRewrite: string): number {
    const MAX_NEW_GENERATED_TOKENS = 512
    const codeToRewriteTokens = charsToTokens(codeToRewrite.length)
    return codeToRewriteTokens + MAX_NEW_GENERATED_TOKENS
}

export function getOpenaiCompatibleChatPrompt(param: {
    systemMessage?: PromptString
    userMessage: PromptString
}): { role: string; content: PromptString }[] {
    const prompt = []
    if (param.systemMessage) {
        prompt.push({ role: 'system', content: param.systemMessage })
    }
    prompt.push({ role: 'user', content: param.userMessage })
    return prompt
}

export function getSourcegraphCompatibleChatPrompt(param: {
    systemMessage: PromptString | undefined
    userMessage: PromptString
}): Message[] {
    const prompt: Message[] = []
    if (param.systemMessage) {
        prompt.push({ speaker: 'system', text: param.systemMessage })
    }
    prompt.push({ speaker: 'human', text: param.userMessage })
    return prompt
}

export function getFireworksCompatibleRewriteSpeculationParams(): FireworksCompatibleRewriteSpeculationArgs {
    if (!isHotStreakEnabled()) {
        return {}
    }
    // The rewrite speculation parameter values are decided based on the offline experiments.
    // Check the PR https://github.com/sourcegraph/cody-chat-eval/pull/157 for more details.
    return {
        rewrite_speculation: true,
        adaptive_speculation: true,
        speculation_length_on_strong_match: 500,
        speculation_min_length_on_strong_match: 500,
        speculation_strong_match_threshold: 20,
    }
}

export function getSourcegraphRewriteSpeculationParams(): CompletionsRewriteSpeculationParams {
    if (!isHotStreakEnabled()) {
        return {}
    }
    return {
        rewriteSpeculation: true,
        adaptiveSpeculation: true,
        speculationLengthOnStrongMatch: 500,
        speculationMinLengthOnStrongMatch: 500,
        speculationStrongMatchThreshold: 20,
    }
}
