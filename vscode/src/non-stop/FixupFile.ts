import path from 'path'

import type * as vscode from 'vscode'
import { type URI } from 'vscode-uri'

/**
 * A handle to a fixup file. FixupFileWatcher is the factory for these; do not
 * construct them directly.
 */
export class FixupFile {
    constructor(
        private id_: number,
        public uri_: vscode.Uri
    ) {}

    public deleted_ = false

    public get isDeleted(): boolean {
        return this.deleted_
    }

    public get uri(): vscode.Uri {
        return this.uri_
    }

    public get fileName(): string {
        return path.basename(this.uri_.fsPath)
    }

    public get filePath(): string {
        return this.uri_.fsPath
    }

    public toString(): string {
        return `FixupFile${this.id_}(${this.uri_})`
    }

    // TODO: Add convenience properties for the file name, type and a change
    // notification so the tree view can track file renames and deletions
}

class FixupFileUriStore {
    private store

    constructor() {
        this.store = new Map<string, URI>()
    }

    public get(taskID: string): URI | undefined {
        return this.store.get(taskID)
    }

    public set(taskID: string, uri: URI): void {
        this.store.set(taskID, uri)
    }

    public delete(taskID: string): void {
        this.store.delete(taskID)
    }
}

/**
 * Used for mapping the updated fixup file for tasks in "new" mode with its id.
 * This allows users to use context from one file to generate content for a different file.
 */
export const NewFixupFileMap = new FixupFileUriStore()
