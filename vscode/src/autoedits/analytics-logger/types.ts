import type * as vscode from 'vscode'

import type { DocumentContext } from '@sourcegraph/cody-shared'

import type { ContextSummary } from '../../completions/context/context-mixer'
import type { CodeGenEventMetadata } from '../../services/CharactersLogger'
import type { ModelResponse } from '../adapters/base'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import type { DecorationInfo } from '../renderer/decorators/base'
import type { DecorationStats } from '../renderer/diff-utils'

/**
 * This file implements a state machine to manage the lifecycle of an autoedit request.
 * Each phase of the request is represented by a distinct state interface, and metadata
 * evolves as the request progresses.
 *
 * 1. Each autoedit request phase (e.g., `started`, `loaded`, `accepted`) is represented by a
 *    `state` interface that extends `AutoeditBaseState` and adds phase-specific fields.
 *
 * 2. Valid transitions between phases are enforced using the `validRequestTransitions` map,
 *    ensuring logical progression through the request lifecycle.
 *
 * 3. The `payload` field in each state encapsulates the exact list of fields that we plan to send
 *    to our analytics backend.
 *
 * 4. Other top-level `state` fields are saved only for bookkeeping and won't end up at our
 *    analytics backend. This ensures we don't send unintentional or redundant information to
 *    the analytics backend.
 *
 * 5. Metadata is progressively enriched as the request transitions between states.
 *
 * 6. Eventually, once we reach one of the terminal states and log its current `payload`.
 */

/**
 * Defines the possible phases of our autoedit request state machine.
 */
export type Phase =
    /** The autoedit request has started. */
    | 'started'
    /** The context for the autoedit has been loaded. */
    | 'contextLoaded'
    /** The autoedit suggestion has been loaded — we have a prediction string. */
    | 'loaded'
    /**
     * The suggestion is not discard during post processing and we have all the data to render the suggestion.
     * This intermediate step is required for the agent API. We cannot graduate the request to the suggested
     * state right away. We first need to save requests metadata to the analytics logger cache, so that
     * agent can access it using the request ID only in `unstable_handleDidShowCompletionItem` calls.
     */
    | 'postProcessed'
    /** The autoedit suggestion has been suggested to the user. */
    | 'suggested'
    /** The autoedit suggestion is marked as read is it's still visible to the user after a hardcoded timeout. */
    | 'read'
    /** The user has accepted the suggestion. */
    | 'accepted'
    /** The user has rejected the suggestion. */
    | 'rejected'
    /** The autoedit request was discarded by our heuristics before being suggested to a user */
    | 'discarded'

/**
 * Defines which phases can transition to which other phases.
 */
export const validRequestTransitions = {
    started: ['contextLoaded', 'discarded'],
    contextLoaded: ['loaded', 'discarded'],
    loaded: ['postProcessed', 'discarded'],
    postProcessed: ['suggested', 'discarded'],
    suggested: ['read', 'accepted', 'rejected'],
    read: ['accepted', 'rejected'],
    accepted: [],
    rejected: [],
    discarded: [],
} as const satisfies Record<Phase, readonly Phase[]>

export const autoeditTriggerKind = {
    /** Suggestion was triggered automatically while editing. */
    automatic: 1,

    /** Suggestion was triggered manually by the user invoking the keyboard shortcut. */
    manual: 2,

    /** When the user uses the suggest widget to cycle through different suggestions. */
    suggestWidget: 3,

    /** Suggestion was triggered automatically by the selection change event. */
    cursor: 4,
} as const

/** We use numeric keys to send these to the analytics backend */
export type AutoeditTriggerKindMetadata = (typeof autoeditTriggerKind)[keyof typeof autoeditTriggerKind]

export const autoeditSource = {
    /** Autoedit originated from a request to our backend for the suggestion.  */
    network: 1,
    /** Autoedit originated from a client cached suggestion.  */
    cache: 2,
} as const

/** We use numeric keys to send these to the analytics backend */
export type AutoeditSourceMetadata = (typeof autoeditSource)[keyof typeof autoeditSource]

export const autoeditDiscardReason = {
    clientAborted: 1,
    emptyPrediction: 2,
    predictionEqualsCodeToRewrite: 3,
    recentEdits: 4,
    suffixOverlap: 5,
    emptyPredictionAfterInlineCompletionExtraction: 6,
    noActiveEditor: 7,
    conflictingDecorationWithEdits: 8,
    notEnoughLinesEditor: 9,
} as const

/** We use numeric keys to send these to the analytics backend */
export type AutoeditDiscardReasonMetadata =
    (typeof autoeditDiscardReason)[keyof typeof autoeditDiscardReason]

/**
 * A stable ID that identifies a particular autoedit suggestion. If the same text
 * and context recurs, we reuse this ID to avoid double-counting.
 */
export type AutoeditSuggestionID = string & { readonly _brand: 'AutoeditSuggestionID' }

/**
 * An ephemeral ID for a single "request" from creation to acceptance or rejection.
 */
export type AutoeditRequestID = string & { readonly _brand: 'AutoeditRequestID' }

/**
 * The base fields common to all request states. We track ephemeral times and
 * the partial payload. Once we reach a certain phase, we log the payload as a telemetry event.
 */
export interface AutoeditBaseState {
    requestId: AutoeditRequestID
    /** Current phase of the autoedit request */
    phase: Phase
}

export interface StartedState extends AutoeditBaseState {
    phase: 'started'
    /** Time (ms) when we started computing or requesting the suggestion. */
    startedAt: number

    /** Metadata required to show a suggestion based on `requestId` only. */
    codeToReplaceData: CodeToReplaceData
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext

    /** Partial payload for this phase. Will be augmented with more info as we progress. */
    payload: {
        /** Document language ID (e.g., 'typescript'). */
        languageId: string

        /** Model used by Cody client to request the autosuggestion suggestion. */
        model: string

        /** Optional trace ID for cross-service correlation, if your environment provides it. */
        traceId?: string

        /** Describes how the autoedit request was triggered by the user. */
        triggerKind: AutoeditTriggerKindMetadata

        /**
         * The code to rewrite by autoedit.
         * 🚨 SECURITY: included only for DotCom users.
         */
        codeToRewrite?: string

        /** True if other autoedit/completion providers might also be active (e.g., Copilot). */
        otherCompletionProviderEnabled: boolean

        /** The exact list of other providers that are active, if known. */
        otherCompletionProviders: string[]

        /** The round trip timings to reach the Sourcegraph and Cody Gateway instances. */
        upstreamLatency?: number
        gatewayLatency?: number
    }
}

export interface ContextLoadedState extends Omit<StartedState, 'phase' | 'payload'> {
    phase: 'contextLoaded'
    /** Timestamp when the context for the autoedit was loaded. */
    contextLoadedAt: number
    payload: StartedState['payload'] & {
        /**
         * Information about the context retrieval process that lead to this autoedit request. Refer
         * to the documentation of {@link ContextSummary}
         */
        contextSummary?: ContextSummary
    }
}

export interface LoadedState extends Omit<ContextLoadedState, 'phase' | 'payload'> {
    phase: 'loaded'
    /** Timestamp when the suggestion completed generation/loading. */
    loadedAt: number
    /** Model response metadata for the debug panel */
    modelResponse: ModelResponse
    payload: ContextLoadedState['payload'] & {
        /**
         * An ID to uniquely identify a suggest autoedit. Note: It is possible for this ID to be part
         * of two suggested events. This happens when the exact same autoedit text is shown again at
         * the exact same location. We count this as the same autoedit and thus use the same ID.
         */
        id: AutoeditSuggestionID

        /**
         * Unmodified by the client prediction text snippet of the suggestion.
         * Might be `undefined` if too long.
         * 🚨 SECURITY: included only for DotCom users.
         */
        prediction?: string

        /** The source of the suggestion, e.g. 'network', 'cache', etc. */
        source?: AutoeditSourceMetadata

        /** True if we fuzzy-matched this suggestion from a local or remote cache. */
        isFuzzyMatch?: boolean

        /** Optional set of relevant response headers (e.g. from Cody Gateway). */
        responseHeaders?: Record<string, string>

        /** Time (ms) to generate or load the suggestion after it was started. */
        latency: number
    }
}

export interface PostProcessedState extends Omit<LoadedState, 'phase' | 'payload'> {
    phase: 'postProcessed'
    /** Timestamp when the post-processing of the suggestion was completed. */
    postProcessedAt: number

    /** Metadata required to show a suggestion based on `requestId` only. */
    prediction: string
    /**
     * The decoration info after the post-processing of the suggestion.
     * Won't include insertions rendered as inline completions.
     */
    decorationInfo: DecorationInfo | null
    inlineCompletionItems: vscode.InlineCompletionItem[] | null

    payload: LoadedState['payload'] & {
        /** The number of added, modified, removed lines and characters from suggestion. */
        decorationStats?: DecorationStats
        /** The number of lines and added chars attributed to an inline completion item. */
        inlineCompletionStats?: {
            lineCount: number
            charCount: number
        }
    }
}

export interface SuggestedState extends Omit<PostProcessedState, 'phase'> {
    phase: 'suggested'
    /** Timestamp when the suggestion was first shown to the user. */
    suggestedAt: number
    payload: PostProcessedState['payload']
}

export interface ReadState extends Omit<SuggestedState, 'phase'> {
    phase: 'read'
    /** Timestamp when the suggestion was marked as visible to the user. */
    readAt: number
    payload: PostProcessedState['payload']
}

/**
 * Common final payload properties shared between accepted and rejected states
 */
export type FinalPayload = PostProcessedState['payload'] & {
    /** Displayed to the user for this many milliseconds. */
    timeFromSuggestedAt: number
    /** True if the suggestion was explicitly/intentionally accepted. */
    isAccepted: boolean
    /**
     * True if the suggestion was visible for a certain time
     * Required to correctly calculate CAR and other metrics where we
     * want to account only for suggestions visible for a certain time.
     *
     * `timeFromSuggestedAt` is not a reliable source of truth for
     * this case because a user could have rejected a suggestion without
     * triggering `accepted` or `discarded` immediately. This is related to
     * limited VS Code APIs which do not provide a reliable way to know
     * if a suggestion is really visible.
     */
    isRead: boolean
    /** The number of the auto-edit started since the last suggestion was shown. */
    suggestionsStartedSinceLastSuggestion: number
}

export interface AcceptedState extends Omit<SuggestedState, 'phase' | 'payload'> {
    phase: 'accepted'
    /** Timestamp when the user accepted the suggestion. */
    acceptedAt: number
    /** Timestamp when the suggestion was logged to our analytics backend. This is to avoid double-logging. */
    suggestionLoggedAt?: number
    /** Optional because it might be accepted before the read timeout */
    readAt?: number
    payload: FinalPayload & Omit<CodeGenEventMetadata, 'charsInserted' | 'charsDeleted'>
}

export interface RejectedState extends Omit<SuggestedState, 'phase' | 'payload'> {
    phase: 'rejected'
    /** Timestamp when the user rejected the suggestion. */
    rejectedAt: number
    /** Timestamp when the suggestion was logged to our analytics backend. This is to avoid double-logging. */
    suggestionLoggedAt?: number
    /** Optional because it might be accepted before the read timeout */
    readAt?: number
    payload: FinalPayload
}

export interface DiscardedState extends Omit<StartedState, 'phase' | 'payload'> {
    phase: 'discarded'
    /** Timestamp when the suggestion was discarded. */
    discardedAt: number
    /** Timestamp when the suggestion was logged to our analytics backend. This is to avoid double-logging. */
    suggestionLoggedAt?: number
    payload: StartedState['payload'] & {
        discardReason: AutoeditDiscardReasonMetadata
    }
}

export interface PhaseStates {
    started: StartedState
    contextLoaded: ContextLoadedState
    loaded: LoadedState
    postProcessed: PostProcessedState
    suggested: SuggestedState
    read: ReadState
    accepted: AcceptedState
    rejected: RejectedState
    discarded: DiscardedState
}

export type AutoeditRequestState = PhaseStates[keyof PhaseStates]
