// import { displayPath, logDebug } from '@sourcegraph/cody-shared'
// import { structuredPatch } from 'diff'
// import * as vscode from 'vscode'
// import { createGitDiff } from '../../../lib/shared/src/editor/create-git-diff'
// import { GHOST_TEXT_COLOR } from '../commands/GhostHintDecorator'
// import type { AutoEditsProviderOptions } from './autoedits-provider'
// import type { CodeToReplaceData } from './prompt-utils'
// import { createCanvas } from 'canvas';

// interface ProposedChange {
//     range: vscode.Range
//     newText: string
// }

// interface DecorationLine {
//     line: number
//     text: string
// }

// const strikeThroughDecorationType = vscode.window.createTextEditorDecorationType({
//     textDecoration: 'line-through',
// })

// const suggesterType = vscode.window.createTextEditorDecorationType({
//     before: { color: GHOST_TEXT_COLOR },
//     after: { color: GHOST_TEXT_COLOR },
// })

// export class AutoEditsRenderer implements vscode.Disposable {
//     private disposables: vscode.Disposable[] = []
//     private activeProposedChange: ProposedChange | null = null

//     constructor() {
//         this.disposables.push(
//             vscode.commands.registerCommand(
//                 'cody.supersuggest.accept',
//                 () => this.acceptProposedChange(),
//                 this.disposables
//             )
//         )
//         this.disposables.push(
//             vscode.commands.registerCommand(
//                 'cody.supersuggest.dismiss',
//                 () => this.dismissProposedChange(),
//                 this.disposables
//             )
//         )
//         this.disposables.push(
//             vscode.languages.registerHoverProvider({ scheme: 'file' }, this)
//         )
//     }

//     public async render(
//         options: AutoEditsProviderOptions,
//         codeToReplace: CodeToReplaceData,
//         predictedText: string
//     ) {
//         this.displayCodeSnippetAtCursor();
//     }

//     private displayCodeSnippetAtCursor(): void {
//         const editor = vscode.window.activeTextEditor;
//         if (!editor) {
//             return;
//         }

//         const cursorPosition = editor.selection.active;
//         const range = new vscode.Range(cursorPosition, cursorPosition);

//         const codeSnippet = `
//       print(arr[1])
//       print(arr[2])
//       print(arr[3])
//         `;

//         // Render the code snippet to an image
//         const fontSize = 14;
//         const fontFamily = 'Consolas, "Courier New", monospace';
//         const theme = {
//             backgroundColor: '#1e1e1e', // You might want to get this from the editor theme
//             foregroundColor: '#d4d4d4',
//         };

//         const dataUrl = this.renderCodeSnippetToImage(codeSnippet.trim(), fontSize, fontFamily, theme);

//         // Create the decoration type
//         const decorationType = vscode.window.createTextEditorDecorationType({
//             after: {
//                 margin: '0 0 0 20px',
//                 width: 'auto',
//                 height: 'auto',
//                 contentIconPath: vscode.Uri.parse(dataUrl),
//             }
//         });

//         // Apply the decoration
//         editor.setDecorations(decorationType, [{ range }]);
//     }

//     // private createImageDecorationType(): vscode.TextEditorDecorationType {
//     //     return vscode.window.createTextEditorDecorationType({
//     //         after: {
//     //             margin: '0 0 0 20px', // Adjust the margin to position the image
//     //             width: 'auto',
//     //             height: 'auto',
//     //             contentIconPath: vscode.Uri.parse(''), // We'll set this later
//     //         }
//     //     });
//     // }

//     private renderCodeSnippetToImage(codeSnippet: string, fontSize: number, fontFamily: string, theme: { backgroundColor: string; foregroundColor: string }): string {
//         const lines = codeSnippet.split('\n');
//         const lineHeight = fontSize * 1.2;
//         const width = 300; // Adjust as needed
//         const height = lines.length * lineHeight + 10;

//         const canvas = createCanvas(width, height);
//         const ctx = canvas.getContext('2d');

//         // Background
//         ctx.fillStyle = theme.backgroundColor;
//         ctx.fillRect(0, 0, width, height);

//         // Text
//         ctx.font = `${fontSize}px ${fontFamily}`;
//         ctx.fillStyle = theme.foregroundColor;

//         lines.forEach((line, index) => {
//             ctx.fillText(line, 5, (index + 1) * lineHeight);
//         });

//         // Convert to data URL
//         return canvas.toDataURL();
//     }

//         const editor = vscode.window.activeTextEditor
//         const document = editor?.document
//         if (!editor || !document) {
//             return
//         }

//         const prevSuffixLine = codeToReplace.endLine - 1
//         const range = new vscode.Range(
//             codeToReplace.startLine,
//             0,
//             prevSuffixLine,
//             options.document.lineAt(prevSuffixLine).range.end.character
//         )
//         this.activeProposedChange = {
//             range: range,
//             newText: predictedText,
//         }

//         const currentFileText = options.document.getText()
//         const predictedFileText =
//             currentFileText.slice(0, document.offsetAt(range.start)) +
//             predictedText +
//             currentFileText.slice(document.offsetAt(range.end))
//         const diff = this.getDiff(options.document.uri, currentFileText, predictedText, predictedFileText)
//         if (this.activeProposedChange) {
//             // If we're already showing an active proposed change, dismiss it
//             await this.dismissProposedChange()
//         }
//         const filename = displayPath(document.uri)
//         const patch = structuredPatch(
//             `a/${filename}`,
//             `b/${filename}`,
//             currentFileText,
//             predictedFileText
//         )
//         let isChanged = false

//         const removedLines: DecorationLine[] = []
//         const addedLines: DecorationLine[] = []
//         for (const hunk of patch.hunks) {
//             let oldLineNumber = hunk.oldStart
//             let newLineNumber = hunk.newStart

//             for (const line of hunk.lines) {
//                 if (line.length === 0) {
//                     continue
//                 }
//                 if (line[0] === '-') {
//                     isChanged = true
//                     removedLines.push({ line: oldLineNumber - 1, text: line.slice(1) })
//                     oldLineNumber++
//                 } else if (line[0] === '+') {
//                     isChanged = true
//                     addedLines.push({ line: newLineNumber - 1, text: line.slice(1) })
//                     newLineNumber++
//                 } else if (line[0] === ' ') {
//                     oldLineNumber++
//                     newLineNumber++
//                 }
//             }
//         }

//         if (!isChanged) {
//             await this.showNoChangeMessageAtCursor()
//             return
//         }

//         editor.setDecorations(
//             strikeThroughDecorationType,
//             removedLines.map(line => ({
//                 range: new vscode.Range(line.line, 0, line.line, document.lineAt(line.line).text.length),
//             }))
//         )
//         editor.setDecorations(
//             suggesterType,
//             addedLines.map(line => ({
//                 range: new vscode.Range(line.line, 0, line.line, document.lineAt(line.line).text.length),
//                 renderOptions: {
//                     after: {
//                         contentText: line.text,
//                     },
//                 },
//             }))
//         )
//         await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)

//         // Register the hover provider for this specific range
//         const hoverDisposable = vscode.languages.registerHoverProvider(
//             { scheme: 'file' },
//             {
//                 provideHover: (document, position, token) => {
//                     if (range.contains(position)) {
//                         return this.provideHover(document, position, token, predictedText)
//                     }
//                     return null
//                 },
//             }
//         )
//         this.disposables.push(
//             hoverDisposable,
//             vscode.workspace.onDidChangeTextDocument(e => {
//                 if (e.document === options.document) {
//                     hoverDisposable.dispose()
//                 }
//             })
//         )

//         // Automatically show the hover
//         vscode.commands.executeCommand('editor.action.showHover')
//     }

//     public provideHover(
//         document: vscode.TextDocument,
//         position: vscode.Position,
//         token: vscode.CancellationToken,
//         diff?: string
//     ): vscode.ProviderResult<vscode.Hover> {
//         if (diff) {
//             const displayDiff = diff.replace('\\ No newline at end of file', '').trim()
//             const markdown = new vscode.MarkdownString()
//             markdown.appendText('✨ Cody Auto Edits ✨\n')
//             markdown.appendCodeblock(displayDiff, 'diff')

//             // Create a hover with transparent background and no border
//             markdown.isTrusted = true;
//             markdown.supportHtml = true;
//             const hoverContent = `<div style="background-color: transparent; border: none;">${markdown.value}</div>`;
//             return new vscode.Hover(new vscode.MarkdownString(hoverContent));
//         }
//         return null
//     }


//     async acceptProposedChange(): Promise<void> {
//         if (this.activeProposedChange === null) {
//             return
//         }
//         const editor = vscode.window.activeTextEditor
//         if (!editor) {
//             await this.dismissProposedChange()
//             return
//         }
//         const currentActiveChange = this.activeProposedChange
//         await editor.edit(editBuilder => {
//             editBuilder.replace(currentActiveChange.range, currentActiveChange.newText)
//         })
//         await this.dismissProposedChange()
//     }

//     async dismissProposedChange(): Promise<void> {
//         this.activeProposedChange = null
//         await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)
//         const editor = vscode.window.activeTextEditor
//         if (!editor) {
//             return
//         }
//         editor.setDecorations(strikeThroughDecorationType, [])
//         editor.setDecorations(suggesterType, [])
//     }

//     private async showNoChangeMessageAtCursor() {
//         this.activeProposedChange = null
//         const editor = vscode.window.activeTextEditor
//         if (!editor) {
//             return
//         }

//         const position = editor.selection.active
//         const lineLength = editor.document.lineAt(position.line).text.length
//         const range = new vscode.Range(position.line, 0, position.line, lineLength)
//         editor.setDecorations(suggesterType, [
//             {
//                 range,
//                 renderOptions: {
//                     after: {
//                         contentText: 'Cody: no suggested changes',
//                         color: GHOST_TEXT_COLOR,
//                         fontStyle: 'italic',
//                     },
//                 },
//             },
//         ])
//         await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
//     }

//     private getDiff(uri: vscode.Uri, codeToRewrite: string, predictedText: string, prediction: string): string {
//         const predictedCodeXML = `<code>\n${predictedText}\n</code>`
//         logDebug('AutoEdits', '(Predicted Code@ Cursor Position)\n', predictedCodeXML)
//         const diff = createGitDiff(displayPath(uri), codeToRewrite, prediction)
//         logDebug('AutoEdits', '(Diff@ Cursor Position)\n', diff)
//         return diff
//     }

//     public dispose() {
//         for (const disposable of this.disposables) {
//             disposable.dispose()
//         }
//     }
// }

