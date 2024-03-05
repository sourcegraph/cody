/**
 * This file declares the protocol for communicating between Cody and BFG (Blazingly Fast Graph), a Rust implementation
 * of the "Graph Context" feature flag.
 */
import type { Position, Range } from './agent-protocol'

interface BFGFileContextSnippet {
    fileName: string
    content: string
}

interface BFGSymbolContextSnippet extends BFGFileContextSnippet {
    symbol: string
}

export type Requests = {
    'bfg/initialize': [{ clientName: string }, { serverVersion: string }]
    'bfg/contextAtPosition': [
        { uri: string; content: string; position: Position; maxChars: number; contextRange?: Range },
        { symbols?: BFGSymbolContextSnippet[]; files?: BFGFileContextSnippet[] },
    ]
    // biome-ignore lint/suspicious/noConfusingVoidType: this models a function returning void
    'bfg/gitRevision/didChange': [{ gitDirectoryUri: string }, void]
    // biome-ignore lint/suspicious/noConfusingVoidType: this models a function returning void
    'bfg/workspace/didChange': [{ workspaceUri: string }, void]
    // biome-ignore lint/suspicious/noConfusingVoidType: this models a function returning void
    'bfg/shutdown': [null, void]

    'embeddings/hello': [null, string]
}
export type Notifications = {
    'bfg/placeholderNotification': [null]
}
