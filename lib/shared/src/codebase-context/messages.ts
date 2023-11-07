import { URI } from 'vscode-uri'

import { ActiveTextEditorSelectionRange } from '../editor'
import { Message } from '../sourcegraph-api'

// tracked for telemetry purposes. Which context source provided this context
// file.
export type ContextFileSource = 'embeddings' | 'user' | 'keyword' | 'editor'

export type ContextKind = 'symbol' | 'file' | 'function' | 'method' | 'class'

export interface ContextFile {
    fileName: string // the relative path of the file

    fileUri?: URI
    path?: {
        basename?: string
        dirname?: string
        relative?: string
    }

    range?: ActiveTextEditorSelectionRange
    content?: string

    repoName?: string
    revision?: string

    kind?: ContextKind
    source?: ContextFileSource
}

export interface ContextMessage extends Message {
    file?: ContextFile
    preciseContext?: PreciseContext
}

export interface PreciseContext {
    symbol: {
        fuzzyName?: string
    }
    hoverText: string[]
    definitionSnippet: string
    filePath: string
    range?: {
        startLine: number
        startCharacter: number
        endLine: number
        endCharacter: number
    }
}

export interface HoverContext {
    symbolName: string
    sourceSymbolName?: string
    content: string[]
    uri: string
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
    text: string,
    file: ContextFile,
    response: string = 'Ok.'
): ContextMessage[] {
    return [
        { speaker: 'human', text, file },
        { speaker: 'assistant', text: response },
    ]
}

export function createContextMessageByFile(file: ContextFile, content: string): ContextMessage[] {
    const code = content || file.content
    if (!code) {
        return []
    }

    const fileMessage = `Context from file path @${file.fileName}:\n${code}`
    const symbolMessage = `$${file.fileName} is a ${file.kind} symbol from file path @${file.fileUri?.fsPath}:\n${code}`
    const text = file.kind === 'file' ? fileMessage : symbolMessage

    return [
        { speaker: 'human', text, file },
        { speaker: 'assistant', text: 'OK.' },
    ]
}
