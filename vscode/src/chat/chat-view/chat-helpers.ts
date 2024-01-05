import path from 'path'

import * as vscode from 'vscode'

import { ActiveTextEditorSelectionRange } from '@sourcegraph/cody-shared'
import { ContextFile, ContextMessage } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { EmbeddingsSearchResult } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

import { CodebaseIdentifiers } from './CodebaseStatusProvider'
import { ContextItem } from './SimpleChatModel'

export const relativeFileUrlScheme = 'cody-file-relative'
export const embeddingsUrlScheme = 'cody-remote-embeddings'

/**
 * Returns a URI for a snippet returned from the remote embeddings endpoint
 */
export function remoteEmbeddingSnippetUri(codebase: CodebaseIdentifiers, result: EmbeddingsSearchResult): vscode.Uri {
    return vscode.Uri.from({
        scheme: embeddingsUrlScheme,
        authority: codebase.remote,
        path: '/' + result.fileName,
        fragment: `L${result.startLine}-${result.endLine}`,
        query: `local=${encodeURIComponent(codebase.local)}`,
    })
}

/**
 * Return a URI for a local file that's relative to a workspace folder.
 */
export function relativeFileUri(
    absParentDir: string,
    relPath: string,
    range?: ActiveTextEditorSelectionRange
): vscode.Uri {
    return vscode.Uri.from({
        scheme: relativeFileUrlScheme,
        authority: absParentDir.endsWith('/') ? absParentDir.slice(0, -1) : absParentDir,
        path: relPath.startsWith('/') ? relPath : '/' + relPath,
        fragment: range && rangeToFragment(range),
    })
}

/**
 * Returns a URI for a file from a legacy ContextFile instance
 */
export function legacyContextFileUri(fileName: string, range?: vscode.Range): vscode.Uri {
    return vscode.Uri.from({
        scheme: relativeFileUrlScheme,
        path: fileName,
        fragment: range && rangeToFragment(range),
    })
}

export function rangeToFragment(range: ActiveTextEditorSelectionRange): string {
    return `L${range.start.line}-${range.end.line}`
}

export function fragmentToRange(fragment: string): ActiveTextEditorSelectionRange | undefined {
    const match = fragment.match(/^L(\d+)-(\d+)$/)
    if (!match) {
        return undefined
    }
    return {
        start: {
            line: parseInt(match[1], 10),
            character: 0,
        },
        end: {
            line: parseInt(match[2], 10),
            character: 0,
        },
    }
}

export async function openUri(
    uri: vscode.Uri,
    range?: ActiveTextEditorSelectionRange,
    currentViewColumn?: vscode.ViewColumn
): Promise<void> {
    switch (uri.scheme) {
        case embeddingsUrlScheme: {
            const localCodebaseDir = new URLSearchParams(uri.query).get('local')
            if (!localCodebaseDir) {
                throw new Error(`Failed to open embeddings: missing local codebase dir from uri ${uri}`)
            }
            const relpath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path
            await openFile(path.join(localCodebaseDir, relpath), range, currentViewColumn)
            break
        }
        case relativeFileUrlScheme: {
            const containerDir = uri.authority || ''
            const relPath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path

            const absPath = containerDir
                ? path.join(containerDir, relPath)
                : (await legacyFilenameToAbsPath(relPath)) || relPath

            if (!range) {
                range = uri.fragment ? fragmentToRange(uri.fragment) : undefined
            }

            await openFile(absPath, range, currentViewColumn)
            break
        }
        case 'file':
            await openFile(uri.fsPath, fragmentToRange(uri.fragment), currentViewColumn)
            break
        default:
            throw new Error(`Failed to open uri ${uri}: unsupported scheme "${uri.scheme}"`)
    }
}

async function legacyFilenameToAbsPath(fileName: string): Promise<string | null> {
    for (const workspaceFolder of vscode.workspace.workspaceFolders || []) {
        try {
            const maybeAbsPath = path.join(workspaceFolder.uri.fsPath, fileName)
            await vscode.workspace.fs.stat(vscode.Uri.file(maybeAbsPath))
            return maybeAbsPath
        } catch {
            try {
                const maybeAbsPath = path.join(path.dirname(workspaceFolder.uri.fsPath), fileName)
                await vscode.workspace.fs.stat(vscode.Uri.file(maybeAbsPath))
                return maybeAbsPath
            } catch {
                continue
            }
        }
    }
    return null
}

export async function openFile(
    absPath: string,
    range?: ActiveTextEditorSelectionRange,
    currentViewColumn?: vscode.ViewColumn
): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath))

    let viewColumn = vscode.ViewColumn.Beside
    if (currentViewColumn) {
        viewColumn = currentViewColumn - 1 || currentViewColumn + 1
    }
    const selection = range ? new vscode.Range(range.start.line, 0, range.end.line, 0) : range
    await vscode.window.showTextDocument(doc, { selection, viewColumn, preserveFocus: true, preview: true })
}

// The approximate inverse of CodebaseContext.makeContextMessageWithResponse
export function contextMessageToContextItem(contextMessage: ContextMessage): ContextItem | null {
    if (!contextMessage.text) {
        return null
    }
    const contextText = stripContextWrapper(contextMessage.text)
    if (!contextText) {
        return null
    }
    if (!contextMessage.file) {
        return null
    }
    const range = contextMessage.file.range
    return {
        text: contextText,
        uri:
            contextMessage.file.uri ||
            legacyContextFileUri(contextMessage.file.fileName, activeEditorSelectionRangeToRange(range)),
        range: range && new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character),
    }
}

export function stripContextWrapper(text: string): string | undefined {
    {
        const start = text.indexOf('Use following code snippet')
        if (start >= 0) {
            text = text.slice(start)
            const lines = text.split('\n')
            return lines.slice(2, -1).join('\n')
        }
    }
    {
        const start = text.indexOf('Use the following text from file')
        if (start >= 0) {
            text = text.slice(start)
            const lines = text.split('\n')
            return lines.slice(1).join('\n')
        }
    }
    {
        const start = text.indexOf('My selected ')
        const selectedStart = text.indexOf('<selected>')
        const selectedEnd = text.indexOf('</selected>')
        if (start >= 0 && selectedStart >= 0 && selectedEnd >= 0) {
            text = text.slice(selectedStart, selectedEnd)
            const lines = text.split('\n')
            return lines.slice(1, -1).join('\n')
        }
    }
    return undefined
}

export function contextItemsToContextFiles(items: ContextItem[]): ContextFile[] {
    const contextFiles: ContextFile[] = []
    for (const item of items) {
        let relFsPath = item.uri.fsPath
        if (relFsPath.startsWith('/')) {
            relFsPath = relFsPath.slice(1)
        }
        contextFiles.push({
            uri: item.uri,
            fileName: relFsPath,
            source: 'embeddings',
            range: rangeToActiveTextEditorSelectionRange(item.range),
            content: item.text,
        })
    }
    return contextFiles
}

export function rangeToActiveTextEditorSelectionRange(
    range?: vscode.Range
): ActiveTextEditorSelectionRange | undefined {
    if (!range) {
        return undefined
    }
    return {
        start: {
            line: range.start.line,
            character: range.start.character,
        },
        end: {
            line: range.end.line,
            character: range.end.character,
        },
    }
}

function activeEditorSelectionRangeToRange(range?: ActiveTextEditorSelectionRange): vscode.Range | undefined {
    if (!range) {
        return undefined
    }
    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
}

export function getChatPanelTitle(lastDisplayText?: string, truncateTitle = true): string {
    if (!lastDisplayText) {
        return 'New Chat'
    }
    // Regex to remove the markdown formatted links with this format: '[_@FILENAME_]()'
    const MARKDOWN_LINK_REGEX = /\[_(.+?)_]\((.+?)\)/g
    lastDisplayText = lastDisplayText.replaceAll(MARKDOWN_LINK_REGEX, '$1')?.trim()
    if (!truncateTitle) {
        return lastDisplayText
    }
    // truncate title that is too long
    return lastDisplayText.length > 25 ? lastDisplayText.slice(0, 25).trim() + '...' : lastDisplayText
}
