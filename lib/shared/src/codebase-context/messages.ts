import { type URI } from 'vscode-uri'

import { type ActiveTextEditorSelectionRange } from '../editor'
import { type Message } from '../sourcegraph-api'

// tracked for telemetry purposes. Which context source provided this context file.
// embeddings: context file returned by the embeddings client
// user: context file provided by the user explicitly via chat input
// keyword: the context file returned from local keyword search
// editor: context file retrieved from the current editor
// search: context file returned by symf search
// selection: selected code from the current editor
// terminal: output from shell terminal
export type ContextFileSource =
    | 'embeddings'
    | 'user'
    | 'keyword'
    | 'editor'
    | 'filename'
    | 'search'
    | 'unified'
    | 'selection'
    | 'terminal'

export type ContextFileType = 'file' | 'symbol'

export type SymbolKind = 'class' | 'function' | 'method'

interface ContextFileCommon {
    uri: URI
    range?: ActiveTextEditorSelectionRange
    repoName?: string
    revision?: string

    /**
     * For anything other than a file or symbol, the title to display (e.g., "Terminal Output").
     */
    title?: string

    source?: ContextFileSource
    content?: string
}

export type ContextFile = ContextFileFile | ContextFileSymbol
export type ContextFileFile = ContextFileCommon & { type: 'file' }
export type ContextFileSymbol = ContextFileCommon & {
    type: 'symbol'

    /** The fuzzy name of the symbol (if this represents a symbol). */
    symbolName: string

    kind: SymbolKind
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
    return [
        {
            speaker: 'human',
            text:
                file.type === 'file'
                    ? `Context from file path @${file.uri?.path}:\n${code}`
                    : `$${file.symbolName} is a ${file.kind} symbol from file path @${file.uri?.fsPath}:\n${code}`,
            file,
        },
        { speaker: 'assistant', text: 'OK.' },
    ]
}
