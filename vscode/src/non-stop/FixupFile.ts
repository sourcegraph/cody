import * as vscode from 'vscode'

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

    // public async getDocument(options =  {background: false}): Promise<FixupFileEditor> {
    //     const visibleEditor = vscode.window.visibleTextEditors.find(
    //         editor => editor.document.uri.toString() === this.uri_.toString()
    //     )
    //     if (visibleEditor) {
    //         return {
    //             editor: visibleEditor,
    //             document: visibleEditor.document
    //         }
    //     } else if (options.background){
    //         return {
    //             document: await vscode.workspace.openTextDocument(this.uri_),
    //             editor: new vscode.WorkspaceEdit()
    //         }
    //     }

    //     const editor = await vscode.window.showTextDocument(this.uri_)
    //     return editor.document
    // }
}

interface FixupFileEditor {
    editor: vscode.TextEditor
    document: vscode.TextDocument
}
