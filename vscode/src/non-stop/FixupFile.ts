import type * as vscode from 'vscode'

/**
 * A handle to a fixup file. FixupFileObserver is the factory for these; do not
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

    public toString(): string {
        return `FixupFile${this.id_}(${this.uri_})`
    }

    // TODO: Add convenience properties for the file name, type and a change
    // notification so the tree view can track file renames and deletions
}

class FixupFileUriStore {
    private store
    private map = new Map<string, string>()

    constructor() {
        // taskID <-> test file uri
        this.store = new Map<string, vscode.Uri>()
    }

    public get(taskID: string): vscode.Uri | undefined {
        return this.store.get(taskID)
    }

    public match(uri: vscode.Uri): string | undefined {
        return this.map.get(uri.toString())
    }

    public set(taskID: string, uri: vscode.Uri): void {
        this.store.set(taskID, uri)
        this.map.set(uri.toString(), taskID)
    }

    public delete(taskID: string): void {
        const uri = this.store.get(taskID)
        this.store.delete(taskID)
        if (uri) {
            this.map.delete(uri.toString())
        }
    }
}

/**
 * Used for mapping the updated fixup file for tasks in "new" mode with its id.
 * This allows users to use context from one file to generate content for a different file.
 */
export const NewFixupFileMap = new FixupFileUriStore()
