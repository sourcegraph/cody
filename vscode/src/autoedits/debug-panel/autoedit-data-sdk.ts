import type { InlineCompletionItemRetrievedContext } from '../../completions/analytics-logger'
import type { ModelResponse, PartialModelResponse, SuccessModelResponse } from '../adapters/base'
import type {
    AutoeditDiscardReasonMetadata,
    AutoeditHotStreakID,
    AutoeditTriggerKindMetadata,
    HotStreakChunk,
} from '../analytics-logger'
import type { AutoEditRenderOutput } from '../renderer/render-output'
import { getDetailedTimingInfo } from './autoedit-latency-utils'
import type { AutoeditRequestDebugState } from './debug-store'

export const extractAutoeditData = (entry: AutoeditRequestDebugState) => {
    const phase = entry.state.phase
    const discardReason = getDiscardReason(entry)
    const filePath = getFilePath(entry)
    const fileName = getFileName(entry)
    const codeToRewrite = getCodeToRewrite(entry)
    const prediction = getPrediction(entry)
    const triggerKind = getTriggerKind(entry)
    const positionInfo = getPositionInfo(entry)
    const languageId = getLanguageId(entry)
    const decorationStats = getDecorationStats(entry)
    const model = getModel(entry)
    const timing = getDetailedTimingInfo(entry)
    const document = getDocument(entry)
    const position = getPosition(entry)
    const modelResponse = getModelResponse(entry)
    const context = getContext(entry)
    const renderOutput = getRenderOutput(entry)
    const hotStreakId = getHotStreakId(entry)

    return {
        phase,
        discardReason,
        filePath,
        fileName,
        codeToRewrite,
        prediction,
        triggerKind,
        positionInfo,
        languageId,
        decorationStats,
        model,
        timing,
        document,
        position,
        modelResponse,
        context,
        renderOutput,
        hotStreakId,
    }
}

/**
 * Gets the start time of an autoedit request based on its state
 */
export const getStartTime = (entry: AutoeditRequestDebugState): number => {
    const { state } = entry
    if ('startedAt' in state) {
        return state.startedAt
    }
    return entry.updatedAt
}

/**
 * Gets the document object from the entry
 */
export const getDocument = (entry: AutoeditRequestDebugState) => {
    if ('document' in entry.state) {
        return entry.state.document
    }
    return null
}

/**
 * Gets the position object from the entry
 */
export const getPosition = (entry: AutoeditRequestDebugState) => {
    if ('position' in entry.state) {
        return entry.state.position
    }
    return null
}

/**
 * Gets the model used for the request
 */
export const getModel = (entry: AutoeditRequestDebugState): string | null => {
    if ('payload' in entry.state && 'model' in entry.state.payload) {
        return entry.state.payload.model
    }
    return null
}

/**
 * Extracts the relative file path from an autoedit entry relative to workspace root.
 */
export const getFilePath = (entry: AutoeditRequestDebugState): string => {
    return entry.state.filePath
}

/**
 * Extracts the file name from an autoedit entry
 */
export const getFileName = (entry: AutoeditRequestDebugState): string => {
    if ('document' in entry.state && entry.state.document) {
        // Access the URI property of the document which should contain the path
        // Using optional chaining to safely access properties
        const uri = entry.state.document.uri || entry.state.document.fileName

        if (uri) {
            // Extract just the filename without the path
            // Handle both string paths and URI objects
            const fileName = uri.path.split('/').pop() || 'Unknown file'
            return fileName
        }
    }
    return 'Unknown file'
}

/**
 * Extracts code preview from an autoedit entry
 */
export const getCodeToRewrite = (entry: AutoeditRequestDebugState): string | undefined => {
    if ('codeToReplaceData' in entry.state && 'codeToRewrite' in entry.state.codeToReplaceData) {
        return entry.state.codeToReplaceData.codeToRewrite
    }
    return undefined
}

export const getContext = (entry: AutoeditRequestDebugState): InlineCompletionItemRetrievedContext[] => {
    if ('context' in entry.state) {
        return entry.state.context
    }
    return []
}

/**
 * Gets the trigger kind in a readable format
 */
export const getTriggerKind = (entry: AutoeditRequestDebugState): string => {
    if ('payload' in entry.state && 'triggerKind' in entry.state.payload) {
        const triggerMap: Record<AutoeditTriggerKindMetadata, string> = {
            1: 'Automatic',
            2: 'Manual',
            3: 'Suggest Widget',
            4: 'Cursor',
        }
        return triggerMap[entry.state.payload.triggerKind] || 'Unknown'
    }
    return 'Unknown trigger'
}

/**
 * Gets position information from an autoedit entry
 */
export const getPositionInfo = (entry: AutoeditRequestDebugState): string => {
    if ('position' in entry.state && entry.state.position) {
        // Handle position object safely by extracting line and character
        const line = entry.state.position.line !== undefined ? entry.state.position.line + 1 : '?'
        const character =
            entry.state.position.character !== undefined ? entry.state.position.character : '?'
        return `${line}:${character}`
    }
    return ''
}

/**
 * Map of discard reason codes to human-readable messages
 */
export const DISCARD_REASONS: Record<AutoeditDiscardReasonMetadata, string> = {
    1: 'Client Aborted',
    2: 'Empty Prediction',
    3: 'Prediction Equals Code to Rewrite',
    4: 'Recent Edits',
    5: 'Suffix Overlap',
    6: 'Empty Prediction After Inline Completion Extraction',
    7: 'No Active Editor',
    8: 'Conflicting Decoration With Edits',
    9: 'Not Enough Lines in Editor',
    10: 'Stale Throttled Request',
    11: 'Next Cursor Suggestion Shown Instead',
}

/**
 * Gets discard reason if applicable
 */
export const getDiscardReason = (entry: AutoeditRequestDebugState): string | null => {
    if (
        entry.state.phase === 'discarded' &&
        'payload' in entry.state &&
        'discardReason' in entry.state.payload
    ) {
        return (
            DISCARD_REASONS[entry.state.payload.discardReason] ||
            `Unknown (${entry.state.payload.discardReason})`
        )
    }
    return null
}

/**
 * Gets language ID if available
 */
export const getLanguageId = (entry: AutoeditRequestDebugState): string | null => {
    if ('payload' in entry.state && 'languageId' in entry.state.payload) {
        return entry.state.payload.languageId
    }
    return null
}

/**
 * Gets decoration stats if available
 */
export const getDecorationStats = (entry: AutoeditRequestDebugState): string | null => {
    if (
        'payload' in entry.state &&
        'decorationStats' in entry.state.payload &&
        entry.state.payload.decorationStats
    ) {
        const stats = entry.state.payload.decorationStats
        const addedLines = stats.addedLines || 0
        const modifiedLines = stats.modifiedLines || 0
        const removedLines = stats.removedLines || 0

        const parts = []
        if (addedLines > 0) parts.push(`+${addedLines} lines`)
        if (modifiedLines > 0) parts.push(`~${modifiedLines} lines`)
        if (removedLines > 0) parts.push(`-${removedLines} lines`)

        return parts.length > 0 ? parts.join(', ') : null
    }
    return null
}

/**
 * Safely get the payload from the entry
 */
export const getPayload = (entry: AutoeditRequestDebugState) => {
    if ('payload' in entry.state) {
        return entry.state.payload
    }
    return null
}

/**
 * Get the request ID
 */
export const getRequestId = (entry: AutoeditRequestDebugState): string => {
    return entry.state.requestId
}

/**
 * Get the prediction text if available
 */
export const getPrediction = (entry: AutoeditRequestDebugState): string | null => {
    if ('prediction' in entry.state && typeof entry.state.prediction === 'string') {
        return entry.state.prediction
    }
    return null
}

/**
 * Extract network latency information from the entry state
 */
export const getNetworkLatencyInfo = (
    entry: AutoeditRequestDebugState
): { upstreamLatency?: number; gatewayLatency?: number } => {
    const upstreamLatency =
        entry.state.phase === 'started'
            ? entry.state.payload.upstreamLatency
            : 'payload' in entry.state && 'upstreamLatency' in entry.state.payload
              ? entry.state.payload.upstreamLatency
              : undefined

    const gatewayLatency =
        entry.state.phase === 'started'
            ? entry.state.payload.gatewayLatency
            : 'payload' in entry.state && 'gatewayLatency' in entry.state.payload
              ? entry.state.payload.gatewayLatency
              : undefined

    return { upstreamLatency, gatewayLatency }
}

export const getSuccessModelResponse = (
    entry: AutoeditRequestDebugState
): SuccessModelResponse | PartialModelResponse | null => {
    if (
        'modelResponse' in entry.state &&
        (entry.state.modelResponse.type === 'success' || entry.state.modelResponse.type === 'partial')
    ) {
        return entry.state.modelResponse
    }
    return null
}

/**
 * Get hot streak chunks if available
 */
export const getHotStreakChunks = (entry: AutoeditRequestDebugState): HotStreakChunk[] | null => {
    if (
        'hotStreakChunks' in entry.state &&
        Array.isArray(entry.state.hotStreakChunks) &&
        entry.state.hotStreakChunks.length > 0
    ) {
        return entry.state.hotStreakChunks
    }
    return null
}

/**
 * Get the hot streak ID if available
 */
export const getHotStreakId = (entry: AutoeditRequestDebugState): AutoeditHotStreakID | null => {
    if ('hotStreakId' in entry.state && entry.state.hotStreakId) {
        return entry.state.hotStreakId
    }
    return null
}

/**
 * Get the full response body from the model if available
 */
export const getFullResponseBody = (entry: AutoeditRequestDebugState): any | null => {
    if (
        'modelResponse' in entry.state &&
        entry.state.modelResponse.type === 'success' &&
        entry.state.modelResponse?.responseBody
    ) {
        return entry.state.modelResponse.responseBody
    }
    return null
}

/**
 * Get the complete model response if available
 */
export const getModelResponse = (entry: AutoeditRequestDebugState): ModelResponse | null => {
    if ('modelResponse' in entry.state) {
        return entry.state.modelResponse
    }
    return null
}

/**
 * Get the render output if available
 */
export const getRenderOutput = (entry: AutoeditRequestDebugState): AutoEditRenderOutput | null => {
    if ('renderOutput' in entry.state) {
        return entry.state.renderOutput
    }
    return null
}

export const AutoeditDataSDK = {
    extractAutoeditData,
    getStartTime,
    getFilePath,
    getFileName,
    getCodeToRewrite,
    getTriggerKind,
    getPositionInfo,
    getDiscardReason,
    getLanguageId,
    getDecorationStats,
    getPayload,
    getRequestId,
    getPrediction,
    getDocument,
    getPosition,
    getModel,
    getNetworkLatencyInfo,
    getFullResponseBody,
    getModelResponse,
    getHotStreakChunks,
    getHotStreakId,
}
