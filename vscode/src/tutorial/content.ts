import * as vscode from 'vscode'
import { findRangeOfText } from './utils'

export const TUTORIAL_MACOS_CONTENT = `### Welcome to Cody!
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
Pro-tip: you can press Opt+\\ to generate new
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
def log_fruits():
    print("List of fruits:", "apple,", "banana,", "cherry")
#         ^ Place cursor here and press Cmd+.

### Part 4: Start a chat
#
# Start a Chat (Opt+L)
`

export const TUTORIAL_CONTENT = TUTORIAL_MACOS_CONTENT.replace('Opt', 'Alt').replace('Cmd', 'Ctrl')

export const getInteractiveRanges = (document: vscode.TextDocument) => {
    const autocompleteLine = findRangeOfText(document, '^ Place cursor above')!.start.line - 1
    const autocompleteRange = new vscode.Range(
        new vscode.Position(autocompleteLine, 0),
        new vscode.Position(autocompleteLine, Number.MAX_SAFE_INTEGER)
    )
    const editLine = findRangeOfText(document, '^ Place cursor above and press')!.start.line - 1
    const editRange = new vscode.Range(
        new vscode.Position(editLine, 0),
        new vscode.Position(editLine, Number.MAX_SAFE_INTEGER)
    )

    const fixLine = findRangeOfText(document, '^ Place cursor here and press')!.start.line - 1
    // The fix range already has characters, so limit this to the actual text in the line
    const fixRange = new vscode.Range(
        new vscode.Position(fixLine, document.lineAt(fixLine).firstNonWhitespaceCharacterIndex),
        new vscode.Position(fixLine, Number.MAX_SAFE_INTEGER)
    )

    return {
        Autocomplete: {
            range: autocompleteRange,
            originalText: document.getText(autocompleteRange).trim(),
        },
        Edit: {
            range: editRange,
            originalText: document.getText(editRange).trim(),
        },
        Fix: {
            range: fixRange,
            originalText: document.getText(fixRange).trim(),
        },
    }
}
