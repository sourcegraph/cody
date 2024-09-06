import { test as t } from '@playwright/test'
import type { GreaterThanOrEqual } from 'type-fest'
import { URI } from 'vscode-uri'
import { SessionChild } from './sessionChild'
export class Editor extends SessionChild {
    openFile(args: OpenFileArgs) {
        return t.step('Editor.openFile', async () => {
            //todo: we might want to open in a specific editor pane
            const file = await this.session.runMacro(
                'uix:openFile',
                async function (args) {
                    const { file = `\${workspaceFolder}/${args.workspaceFile}`, viewColumn } = args
                    const uri = this.vscode.Uri.file(this.utils.substitutePathVars(file))
                    const showOptions = { preserveFocus: true, preview: false, viewColumn }
                    await this.vscode.commands.executeCommand('vscode.open', uri, showOptions)
                    return uri
                },
                [args]
            )
            // it comes back JSON serialized, so we need to parse it
            const uri = URI.from(file)
            if (args.selection) {
                //TODO: pass in returned file
                await this.select({ selection: args.selection })
            }
            return uri
        })
    }

    async select(args: SelectArgs) {
        //TODO: We might want to activate a specific editor/file. For now we just assume the currently active one
        return await this.session.runMacro(
            'uix:select',
            async function (args) {
                const editor = this.vscode.window.activeTextEditor
                if (!editor) {
                    throw new Error('No editor is active')
                }
                const { line: startLine, col: startCharacter = 1 } =
                    args.selection.start || args.selection
                const { line: endLine, col: endCharacter = 1 } =
                    args.selection.end || args.selection.start || args.selection
                const fromPosition = new this.vscode.Position(startLine - 1, startCharacter - 1)
                const toPosition = new this.vscode.Position(endLine - 1, endCharacter - 1)
                editor.selections = [new this.vscode.Selection(fromPosition, toPosition)]
                editor.revealRange(
                    editor.selection,
                    this.vscode.TextEditorRevealType.InCenterIfOutsideViewport
                )
            },
            [args]
        )
    }

    get active() {
        return this.session.page.locator('.editor-group-container.active')
    }
}

type OpenFileArgs = (
    | { file: string; workspaceFile?: never }
    | {
          workspaceFile: string
          file?: never
      }
) & {
    selection?: SingleSelection
    viewColumn?: number | 'active' | 'beside' | 'split'
}
type IndexOneBased<T extends number = number> = GreaterThanOrEqual<T, 1> extends true ? T : never
type SingleSelection =
    | { line: IndexOneBased; col?: IndexOneBased; start?: never; end?: never }
    | {
          start: { line: IndexOneBased; col?: IndexOneBased; start?: never; end?: never }
          end?: { line: IndexOneBased; col?: IndexOneBased; start?: never; end?: never }
          line?: never
          col?: never
      }
interface SelectArgs {
    selection: SingleSelection
}
