import * as vscode from 'vscode'

const INTERACTIVE_CONTENT = `
### Welcome to Cody!
"""
This is an interactive getting started doc to show
you how to use some of Cody's editing features
"""

### Part 1: Autocomplete
"""
Place your cursor at the end of the following
function and press tab to accept the
Cody-powered autocomplete.
"""

def hello_world():
    """Prints hello world (with an emoji)"""
\u0020\u0020\u0020\u0020
#   ^ Place cursor above
"""
Pro-tip: you can press Opt+\ to generate new
autocomplete suggestions.
"""

### Part 2: Edit Code with instructions
"""
Next, let's edit code with an instruction. Place the
cursor on the empty line below, and press
Opt+K to open the Edit Code input.
We've pre-filled the instruction,
all you need to do is choose Submit.
"""

# ^ Place cursor above and press Opt+K

### Part 3: Ask Cody to Fix
"""
The following code has a bug. Place the cursor
under the word with the wavy underline,
click the lightbulb (or hit Cmd+.), and ask
Cody to fix it for you:
"""
def hello_world():
    """Prints the given message"""
    print(f"Hello #{message}")

### Part 4: Start a chat
"""
Start a chat
"""
`

// TODO: Add reset walkthrough codelens?

export const triggerInteractiveWalkthrough = async () => {
    const disposables: vscode.Disposable[] = []

    // Open a window to display the walkthrough
    // const tempDocUri = vscode.Uri.parse('cody.py')
    // const interactiveDoc = await vscode.workspace.openTextDocument(tempDocUri)
    // const edit = new vscode.WorkspaceEdit()
    // edit.replace(tempDocUri, new vscode.Range(0, 0, 0, 0), INTERACTIVE_CONTENT)
    // await vscode.workspace.applyEdit(edit)
    const interactiveDoc = await vscode.workspace.openTextDocument({
        language: 'python',
        content: INTERACTIVE_CONTENT,
    })

    const listenForAutocomplete = vscode.window.onDidChangeTextEditorSelection(
        async ({ textEditor }) => {
            const document = textEditor.document
            if (document.uri !== interactiveDoc.uri) {
                console.log('NOOO')
                return
            }

            if (!textEditor.selection.isEmpty) {
                return
            }

            const cursor = textEditor.selection.active
            const interactiveLines = interactiveDoc.getText().split('\n')
            const precedingLine = interactiveLines.findIndex(line => line.includes('Prints hello world'))
            const targetLine = interactiveLines[precedingLine + 1]
            if (cursor.line === precedingLine + 1 && targetLine.trim().length === 0) {
                await vscode.commands.executeCommand('cody.autocomplete.manual-trigger')
            }
        }
    )

    disposables.push(
        listenForAutocomplete,
        vscode.workspace.onDidCloseTextDocument(document => {
            if (document.uri !== interactiveDoc.uri) {
                return
            }

            // Clean up when document is closed
            for (const disposable of disposables) {
                disposable.dispose()
            }
        })
    )
}

export const registerInteractiveWalkthrough = () => {
    vscode.commands.registerCommand('cody.triggerInteractiveWalkthrough', triggerInteractiveWalkthrough)
}
