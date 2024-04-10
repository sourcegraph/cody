import * as vscode from 'vscode'
import {
    TextChange,
    updateFixedRange,
    updateRangeMultipleChanges,
} from '../../src/non-stop/tracked-range'

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

    const interactiveDoc = await vscode.workspace.openTextDocument({
        language: 'python',
        content: INTERACTIVE_CONTENT,
    })

    const interactiveLines = interactiveDoc.getText().split('\n')
    const precedingAutocompleteLine = interactiveLines.findIndex(line =>
        line.includes('Prints hello world')
    )
    let autocompleteRange = new vscode.Range(
        new vscode.Position(precedingAutocompleteLine + 1, 0),
        new vscode.Position(precedingAutocompleteLine + 1, Number.MAX_SAFE_INTEGER)
    )
    const updateAutocompleteRange = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri !== interactiveDoc.uri) {
            return
        }

        const changes = new Array<TextChange>(...event.contentChanges)
        const updatedRange = updateRangeMultipleChanges(autocompleteRange, changes, {}, updateFixedRange)
        if (!updatedRange.isEqual(autocompleteRange)) {
            autocompleteRange = updatedRange
        }
    })
    const listenForAutocomplete = vscode.window.onDidChangeTextEditorSelection(
        async ({ textEditor }) => {
            const document = textEditor.document
            if (document.uri !== interactiveDoc.uri) {
                return
            }

            if (!textEditor.selection.isEmpty) {
                return
            }

            if (
                autocompleteRange.contains(textEditor.selection.active) &&
                document.getText(autocompleteRange).trim().length === 0
            ) {
                // Cursor is on the intended autocomplete line, and we don't already have any content
                // Manually trigger an autocomplete for the ease of the tutorial
                await vscode.commands.executeCommand('cody.autocomplete.manual-trigger')
            }
        }
    )

    disposables.push(
        updateAutocompleteRange,
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
