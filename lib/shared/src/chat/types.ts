import type { URI } from 'vscode-uri'

/**
 * Main container for all tool output types
 */
export interface UIToolOutput {
    status: string
    title?: string
    query?: string
    search?: UISearchResults
    diff?: UIFileDiff
    terminal?: UITerminalLine[]
    file?: UIFileView
}

// Search results display
export interface UISearchResults {
    query: string
    items: UISearchItem[]
}

// Individual search result item
interface UISearchItem extends UIFileView {
    lineNumber?: string
    preview?: string
    type: 'file' | 'folder' | 'code'
}

// Basic file content display
export interface UIFileView {
    fileName: string
    uri: URI
    content?: string
}

// File diff display
export interface UIFileDiff extends UIFileView {
    total: UIChangeStats
    changes: UIDiffLine[]
}

// Change statistics summary
interface UIChangeStats {
    added: number
    removed: number
    modified: number
}

// Individual diff line
export interface UIDiffLine {
    type: 'added' | 'removed' | 'unchanged'
    content: string
    lineNumber: number
}

// Terminal output types
export enum UITerminalLineType {
    Input = 'input',
    Output = 'output',
    Error = 'error',
    Warning = 'warning',
    Success = 'success',
}

// Individual terminal line
export interface UITerminalLine {
    content: string
    type?: UITerminalLineType
}
