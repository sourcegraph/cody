import { URI } from 'vscode-uri'

import { ActiveTextEditorSelectionRange } from '../editor'
import { Message } from '../sourcegraph-api'

// tracked for telemetry purposes. Which context source provided this context file.
// embeddings: context file returned by the embeddings client
// user: context file provided by the user explicitly via chat input
// keyword: the context file returned from local keyword search
// editor: context file retrieved from the current editor
export type ContextFileSource = 'embeddings' | 'user' | 'keyword' | 'editor' | 'filename' | 'unified'

export type ContextFileType = 'file' | 'symbol'

export type SymbolKind = 'class' | 'function' | 'method'

export interface ContextFile {
    // Name of the context
    // for file, this is usually the relative path
    // for symbol, this is usually the fuzzy name of the symbol
    fileName: string

    content?: string

    repoName?: string
    revision?: string

    // Location
    uri?: URI
    path?: {
        basename?: string
        dirname?: string
        relative?: string
    }
    range?: ActiveTextEditorSelectionRange

    // metadata
    source?: ContextFileSource
    type?: ContextFileType
    kind?: SymbolKind
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
    response: string = 'Ok.',
    source: ContextFileSource = 'editor'
): ContextMessage[] {
    file.source = file.source || source

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
    // Replace exisiting leading @ if any
    const fileMessage = `Context from file path @${file.fileName.replace(/^@/, '')}:\n${code}`
    const symbolMessage = `$${file.fileName} is a ${file.kind} symbol from file path @${file.uri?.fsPath}:\n${code}`
    const text = file.type === 'symbol' ? symbolMessage : fileMessage
    return [
        { speaker: 'human', text, file },
        { speaker: 'assistant', text: 'OK.' },
    ]
}
