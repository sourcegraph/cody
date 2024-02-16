import type * as vscode from 'vscode'
import type { EditFileOperation, WorkspaceEditOperation } from '../jsonrpc/agent-protocol'

export class AgentWorkspaceEdit implements vscode.WorkspaceEdit {
    private edits: WorkspaceEditOperation[] = []

    get operations(): WorkspaceEditOperation[] {
        return Array.from(this.edits.values())
    }

    get size(): number {
        return this.edits.length
    }

    public has(uri: vscode.Uri): boolean {
        const uriString = uri.toString()
        for (const operation of this.edits.values()) {
            switch (operation.type) {
                case 'create-file':
                case 'delete-file':
                case 'edit-file':
                    if (operation.uri === uriString) {
                        return true
                    }
                    break
                case 'rename-file':
                    if (operation.oldUri === uriString) {
                        return true
                    }
            }
        }
        return false
    }

    public createFile(
        uri: vscode.Uri,
        options?:
            | {
                  readonly overwrite?: boolean | undefined
                  readonly ignoreIfExists?: boolean | undefined
                  readonly contents?: Uint8Array | vscode.DataTransferFile | undefined
              }
            | undefined,
        metadata?: vscode.WorkspaceEditEntryMetadata | undefined
    ): void {
        if (options?.contents && !(options.contents instanceof Uint8Array)) {
            throw new Error(
                `options.contents must be a Uint8Array. Unsupported argument ${options.contents}`
            )
        }
        this.edits.push({
            type: 'create-file',
            uri: uri.toString(),
            options: {
                overwrite: options?.overwrite,
                ignoreIfExists: options?.ignoreIfExists,
            },
            textContents: options?.contents instanceof Uint8Array ? options?.contents?.toString() : '',
            metadata,
        })
    }

    public deleteFile(
        uri: vscode.Uri,
        options?:
            | {
                  readonly recursive?: boolean | undefined
                  readonly ignoreIfNotExists?: boolean | undefined
              }
            | undefined,
        metadata?: vscode.WorkspaceEditEntryMetadata | undefined
    ): void {
        this.edits.push({
            type: 'delete-file',
            uri: uri.toString(),
            deleteOptions: options,
            metadata,
        })
    }

    public renameFile(
        oldUri: vscode.Uri,
        newUri: vscode.Uri,
        options?:
            | { readonly overwrite?: boolean | undefined; readonly ignoreIfExists?: boolean | undefined }
            | undefined,
        metadata?: vscode.WorkspaceEditEntryMetadata | undefined
    ): void {
        this.edits.push({
            type: 'rename-file',
            oldUri: oldUri.toString(),
            newUri: newUri.toString(),
            options,
            metadata,
        })
    }

    public replace(
        uri: vscode.Uri,
        range: vscode.Range,
        newText: string,
        metadata?: vscode.WorkspaceEditEntryMetadata
    ): void {
        this.editOperation(uri).edits.push({
            type: 'replace',
            range,
            value: newText,
            metadata,
        })
    }

    public insert(
        uri: vscode.Uri,
        position: vscode.Position,
        content: string,
        metadata?: vscode.WorkspaceEditEntryMetadata
    ): void {
        this.editOperation(uri).edits.push({
            type: 'insert',
            position,
            value: content,
            metadata,
        })
    }

    public delete(
        uri: vscode.Uri,
        range: vscode.Range,
        metadata?: vscode.WorkspaceEditEntryMetadata
    ): void {
        this.editOperation(uri).edits.push({
            type: 'delete',
            range,
            metadata,
        })
    }

    private editOperation(uri: vscode.Uri): EditFileOperation {
        const uriString = uri.toString()
        for (const operation of this.edits.values()) {
            if (operation.type === 'edit-file' && operation.uri === uriString) {
                return operation
            }
        }
        const result: EditFileOperation = {
            type: 'edit-file',
            uri: uri.toString(),
            edits: [],
        }
        this.edits.push(result)
        return result
    }

    // ==================
    // Unimplemented APIs
    // ==================

    public entries(): [vscode.Uri, vscode.TextEdit[]][] {
        throw new Error('Method not implemented.')
    }
    public set(uri: vscode.Uri, edits: readonly (vscode.TextEdit | vscode.SnippetTextEdit)[]): void
    public set(
        uri: vscode.Uri,
        edits: readonly [vscode.TextEdit | vscode.SnippetTextEdit, vscode.WorkspaceEditEntryMetadata][]
    ): void
    public set(uri: vscode.Uri, edits: readonly vscode.NotebookEdit[]): void
    public set(
        uri: vscode.Uri,
        edits: readonly [vscode.NotebookEdit, vscode.WorkspaceEditEntryMetadata][]
    ): void
    public set(uri: unknown, edits: unknown): void {
        throw new Error('Method not implemented.')
    }

    public get(uri: vscode.Uri): vscode.TextEdit[] {
        // Not clear what to do about non-edit operations...
        throw new Error('Method not implemented.')
    }
}
