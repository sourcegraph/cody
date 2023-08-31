import { ContextInspectorRecord } from '../chat/context-inspector/context-inspector'
import { Message } from '../sourcegraph-api'

// tracked for telemetry purposes. Which context source provided this context
// file.
//
// For now we just track "embeddings" since that is the main driver for
// understanding if it is being useful.
export type ContextFileSource = 'embeddings'

export interface ContextFile {
    fileName: string
    repoName?: string
    revision?: string

    source?: ContextFileSource
}

export interface ContextMessage extends Message {
    file?: ContextFile
    preciseContext?: PreciseContext
    // Metadata for the context inspector about what this message contains and
    // who created it
    contextInspectorRecord?: ContextInspectorRecord
}

export interface PreciseContext {
    symbol: {
        fuzzyName?: string
    }
    definitionSnippet: string
    filePath: string
    range?: {
        startLine: number
        startCharacter: number
        endLine: number
        endCharacter: number
    }
}

export interface OldContextMessage extends Message {
    fileName?: string
}

export function getContextMessageWithResponse(
    contextInspectorRecord: ContextInspectorRecord,
    file: ContextFile,
    response: string = 'Ok.'
): ContextMessage[] {
    return [
        { speaker: 'human', text: contextInspectorRecord.text, file, contextInspectorRecord },
        { speaker: 'assistant', text: response },
    ]
}
