import * as vscode from 'vscode'

import { getIconPath } from '../services/InlineAssist'

/**
 * Adds Cody icon to the gutter of the active line
 */
export class EditorDecorator implements vscode.Disposable {
    private decoration: vscode.TextEditorDecorationType
    private extensionPath = vscode.extensions.getExtension('sourcegraph.cody-ai')?.extensionPath || ''

    constructor() {
        const gutterIcon = getIconPath('cody', this.extensionPath)
        this.decoration = vscode.window.createTextEditorDecorationType({
            gutterIconPath: gutterIcon,
            gutterIconSize: 'contain',
        })
        vscode.workspace.onDidChangeTextDocument(() => this.update())
        vscode.window.onDidChangeTextEditorSelection(() => this.update())
        this.update()
    }

    public dispose(): void {
        this.decoration.dispose()
    }
    /**
     * Update the decoration when editor code lenses change event is fired
     */
    private update(): void {
        // get editor info and apply decoration to the active line
        const activeActiveEditor = vscode.window.activeTextEditor
        const activeLine = activeActiveEditor?.selection.active.line
        if (activeLine === undefined) {
            return
        }
        const activeLineRange = new vscode.Range(activeLine, 0, activeLine, 0)
        activeActiveEditor?.setDecorations(this.decoration, [
            { range: activeLineRange, hoverMessage: 'Right click here for options' },
        ])
    }
}
