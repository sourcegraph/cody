import type { URI } from 'vscode-uri'

export enum UIToolStatus {
    Pending = 'pending',
    Done = 'done',
    Error = 'error',
    Canceled = 'canceled',
    Idle = 'idle',
    Info = 'info',
}

// Individual search result item
export interface UISearchItem {
    lineNumber?: string
    preview?: string
    type: 'file' | 'folder' | 'code'
    uri: URI
}

// File diff display
export interface UIFileDiff {
    uri: URI
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

export interface UITerminalToolOutput {
    type: 'terminal-output'
    output: UITerminalLine[]
    // Add uri property if needed, or leave it out if not required
}

// Terminal output types
export enum UITerminalOutputType {
    Input = 'input',
    Output = 'output',
    Error = 'error',
    Warning = 'warning',
    Success = 'success',
}

// Individual terminal line
export interface UITerminalLine {
    content: string
    type?: UITerminalOutputType | undefined | null
}
