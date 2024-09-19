import type { ChatClient, PromptString } from '@sourcegraph/cody-shared'
import type { Model } from '@sourcegraph/cody-shared/dist/models'
import type * as vscode from 'vscode'
import type { ContextRetriever } from '../../chat/chat-view/ContextRetriever'

export enum Score {
    WOW = 4,
    AWESOME = 3,
    COOL = 2,
    LGTM = 1,
    BASIC = 0,
}

export namespace Score {
    export function join(...s: (Score | number)[]) {
        const total = s.reduce((a, b) => a + b, 0)
        switch (total) {
            case 1:
                return Score.LGTM
            case 2:
                return Score.COOL
            case 3:
                return Score.AWESOME
            default:
                if (total >= 4) {
                    return Score.WOW
                }
                return Score.BASIC
        }
    }
}

export interface SuggestedPrompt {
    cta: string
    prompt: PromptString
    score: Score
    hiddenInstructions: PromptString
}

export type CandidateFile<T> = {
    uri: vscode.Uri
    score: Score
} & CustomData<T>
// export type CandidateFile<T> = T extends never | null | undefined
//     ? BaseCandidateFile & { data?: never }
//     : BaseCandidateFile & {
//           data: T
//       }
export type CustomData<T> = T extends never ? { data?: unknown } : { data: T }

export type CanidateFileContent<T> = CandidateFile<T> & {
    content: string
}

export interface Ctx {
    chatClient: ChatClient
    contextRetriever: ContextRetriever
    model: Model
    apiVersion: number
}

export interface Detector<T> {
    candidates(
        randomSample: CanidateFileContent<any>[],
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<Array<CandidateFile<T> & CustomData<T>> | undefined | null>

    detect(
        candidate: CanidateFileContent<T>,
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<SuggestedPrompt[] | undefined | null>
}
