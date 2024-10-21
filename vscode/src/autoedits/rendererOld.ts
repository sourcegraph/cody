
// import * as vscode from 'vscode';
// import { createCanvas } from 'canvas';

// export class AutoEditsRenderer implements vscode.Disposable {
//   private decorationType: vscode.TextEditorDecorationType | null = null;

//   constructor() {
//     // If you need to initialize anything, do it here
//   }

//   public dispose() {
//     // Clean up the decoration type when the renderer is disposed
//     if (this.decorationType) {
//       this.decorationType.dispose();
//     }
//   }

//   public async render(): Promise<void> {
//     const editor = vscode.window.activeTextEditor;
//     if (!editor) {
//       return;
//     }

//     const cursorPosition = editor.selection.active;
//     const range = new vscode.Range(cursorPosition, cursorPosition);

//     const codeSnippet = `
// print(arr[1])
// print(arr[2])
// print(arr[3])
//     `.trim();

//     // Get editor configuration for font and theme
//     const configuration = vscode.workspace.getConfiguration('editor', editor.document.uri);
//     const fontSize = configuration.get<number>('fontSize', 14);
//     const fontFamily = configuration.get<string>('fontFamily', 'Consolas, "Courier New", monospace');

//     // Get theme colors
//     const theme = this.getThemeColors();

//     // Render the code snippet to an image
//     const dataUrl = await this.renderCodeSnippetToImage(
//       codeSnippet,
//       fontSize,
//       fontFamily,
//       theme
//     );

//     // Create the decoration type
//     this.createImageDecorationType(dataUrl);

//     // Apply the decoration
//     if (this.decorationType) {
//       editor.setDecorations(this.decorationType, [{ range }]);
//     }
//   }

//   private getThemeColors(): { backgroundColor: string; foregroundColor: string } {
//     // const theme = vscode.window.activeColorTheme;

//     // Default colors
//     let backgroundColor = '#1e1e1e';
//     let foregroundColor = '#d4d4d4';

//     // You can get actual theme colors if needed
//     // For simplicity, we'll use default values
//     // Alternatively, use theme.getColor() with proper keys

//     return { backgroundColor, foregroundColor };
//   }

//   private async renderCodeSnippetToImage(
//     codeSnippet: string,
//     fontSize: number,
//     fontFamily: string,
//     theme: { backgroundColor: string; foregroundColor: string }
//   ): Promise<string> {
//     const lines = codeSnippet.split('\n');
//     const lineHeight = fontSize * 1.2;
//     const padding = 10;
//     const width = 300; // Adjust as needed or calculate based on text width
//     const height = lines.length * lineHeight + padding * 2;

//     const canvas = createCanvas(width, height);
//     const ctx = canvas.getContext('2d');

//     // Background
//     ctx.fillStyle = theme.backgroundColor;
//     ctx.fillRect(0, 0, width, height);

//     // Text
//     ctx.font = `${fontSize}px ${fontFamily}`;
//     ctx.fillStyle = theme.foregroundColor;
//     ctx.textBaseline = 'top';

//     lines.forEach((line, index) => {
//       ctx.fillText(line, padding, padding + index * lineHeight);
//     });

//     // Convert to data URL
//     return canvas.toDataURL();
//   }

//   private createImageDecorationType(dataUrl: string): void {
//     // Dispose previous decoration if any
//     if (this.decorationType) {
//       this.decorationType.dispose();
//     }

//     this.decorationType = vscode.window.createTextEditorDecorationType({
//       after: {
//         margin: '0 0 0 20px',
//         width: 'auto',
//         height: 'auto',
//         contentIconPath: vscode.Uri.parse(dataUrl),
//       },
//       // Ensure the decoration doesn't affect the layout
//       rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
//     });
//   }
// }
