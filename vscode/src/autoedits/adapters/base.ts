import type * as vscode from 'vscode'

import type { CodeCompletionsParams, PromptString } from '@sourcegraph/cody-shared'

import type { AutoeditSourceMetadata } from '../analytics-logger/types'
import type { AutoeditsRequestBody } from './utils'

// TODO: convert it to numbered enum to propagate with our analytics events for all instances
export enum AutoeditStopReason {
    StreamingChunk = 'cody-streaming-chunk',
    RequestAborted = 'cody-request-aborted',
    IrrelevantInFlightRequest = 'cody-irrelevant-in-flight-request',
    RequestFinished = 'cody-request-finished',
    HotStreak = 'cody-hot-streak',
}

export type ModelResponseShared = {
    type: 'success' | 'partial' | 'aborted'
    stopReason: AutoeditStopReason
    /** URL used to make the request to the model API */
    requestUrl: string
    /** Optional request headers sent to the model API */
    requestHeaders?: Record<string, string>
    /**
     * Optional request body sent to the model API
     * TODO: update to proper types from different adapters.
     */
    requestBody?: AutoeditsRequestBody | CodeCompletionsParams
}

export interface SuccessModelResponse extends ModelResponseShared {
    type: 'success'
    stopReason: AutoeditStopReason.RequestFinished | AutoeditStopReason.HotStreak
    prediction: string
    /**
     * Response headers received from the model API
     */
    responseHeaders: Record<string, string>
    /**
     * Optional full response body received from the model API
     * This is propagated to the analytics logger for debugging purposes
     * TODO: replace `any` with the proper type.
     */
    responseBody: Record<string, any>
    /**
     * The source of the suggestion, e.g. 'network', 'cache', etc.
     */
    source?: AutoeditSourceMetadata
}

/**
 * Represents a partial response from the model API
 * This is used for streaming responses
 */
export interface PartialModelResponse extends ModelResponseShared {
    type: 'partial'
    stopReason: AutoeditStopReason.StreamingChunk | AutoeditStopReason.HotStreak
    prediction: string
    /**
     * Response headers received from the model API
     */
    responseHeaders: Record<string, string>
    /**
     * Optional full response body received from the model API
     * This is propagated to the analytics logger for debugging purposes
     * TODO: replace `any` with the proper type.
     */
    responseBody: Record<string, any>
    /**
     * The source of the suggestion, e.g. 'network', 'cache', etc.
     */
    source?: AutoeditSourceMetadata
}

export interface AbortedModelResponse extends ModelResponseShared {
    type: 'aborted'
    stopReason: AutoeditStopReason.RequestAborted | AutoeditStopReason.IrrelevantInFlightRequest
}

export type ModelResponse = SuccessModelResponse | PartialModelResponse | AbortedModelResponse

export interface AutoeditsModelAdapter extends vscode.Disposable {
    getModelResponse(args: AutoeditModelOptions): Promise<AsyncGenerator<ModelResponse>>
}

/**
 * Represents the structure of a prompt for auto-edit functionality
 */
export type AutoeditsPrompt = {
    /**
     * Optional system message to provide context or instructions
     * This field is only valid for the chat models.
     * For the completions models, this is ignored by the adapters.
     */
    systemMessage?: PromptString
    /**
     * The user message containing the code to be rewritten.
     */
    userMessage: PromptString
}

export interface AutoeditModelOptions {
    url: string
    model: string
    prompt: AutoeditsPrompt
    codeToRewrite: string
    userId: string | null
    isChatModel: boolean
    abortSignal: AbortSignal
    timeoutMs: number
}
