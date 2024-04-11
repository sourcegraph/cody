import * as vscode from 'vscode'
import {
    type TextChange,
    updateFixedRange,
    updateRangeMultipleChanges,
} from '../../src/non-stop/tracked-range'

const INTERACTIVE_CONTENT = `### Welcome to Cody!
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

const EMOJI_SVG_TEMPLATE = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24px">{emoji}</text>
</svg>`

type TUTORIAL_STATES = 'Intro' | 'Todo' | 'Done'
const TUTORIAL_EMOJIS: Record<TUTORIAL_STATES, string> = {
    Intro: '&#128075;',
    Todo: '&#128073;',
    Done: '&#x2705;',
}
const transformEmojiToSvg = (emoji: string) => {
    const svg = EMOJI_SVG_TEMPLATE.replace('{emoji}', emoji)
    const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
    return vscode.Uri.parse(uri)
}

const INTRO_DECORATION: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Intro),
    gutterIconSize: 'contain',
})
const TODO_DECORATION: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Todo),
    gutterIconSize: 'contain',
})
const COMPLETE_DECORATION: vscode.TextEditorDecorationType =
    vscode.window.createTextEditorDecorationType({
        gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Done),
        gutterIconSize: 'contain',
    })

export const getLineRangeFromDocumentText = (lines: string[], text: string): vscode.Range => {
    const line = lines.findIndex(line => line.includes(text))
    return new vscode.Range(
        new vscode.Position(line, 0),
        new vscode.Position(line, Number.MAX_SAFE_INTEGER)
    )
}

export const triggerInteractiveTutorial = async () => {
    const disposables: vscode.Disposable[] = []
    const interactiveDoc = await vscode.workspace.openTextDocument({
        language: 'python',
        content: INTERACTIVE_CONTENT,
    })
    const interactiveEditor = await vscode.window.showTextDocument(interactiveDoc)
    const interactiveLines = interactiveDoc.getText().split('\n')

    // Register lines within the document to keep track of and look for.
    const introLine = interactiveLines.findIndex(line => line.includes('Welcome to Cody'))
    let introRange = new vscode.Range(
        new vscode.Position(introLine, 0),
        new vscode.Position(introLine, Number.MAX_SAFE_INTEGER)
    )
    const autocompleteLine = interactiveLines.findIndex(line => line.includes('Place cursor above')) - 1
    let autocompleteRange = new vscode.Range(
        new vscode.Position(autocompleteLine, 0),
        new vscode.Position(autocompleteLine, Number.MAX_SAFE_INTEGER)
    )
    const editLine =
        interactiveLines.findIndex(line => line.includes('Place cursor above and press Opt+K')) - 1
    let editRange = new vscode.Range(
        new vscode.Position(editLine, 0),
        new vscode.Position(editLine, Number.MAX_SAFE_INTEGER)
    )

    // Set gutter decorations for associated lines, note: VS Code automatically keeps track of these lines
    // so we don't need to update these
    interactiveEditor.setDecorations(INTRO_DECORATION, [introRange])
    interactiveEditor.setDecorations(TODO_DECORATION, [autocompleteRange, editRange])

    /**
     * Listen for changes in the tutorial text document, and update the
     * interactive line ranges depending on those changes.
     * This ensures that, even if the user modifies the document,
     * we can accurately track where we want them to interact.
     */
    const listenForInteractiveLineRangeUpdates = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri !== interactiveDoc.uri) {
            return
        }

        const changes = new Array<TextChange>(...event.contentChanges)
        const newIntroRange = updateRangeMultipleChanges(introRange, changes, {}, updateFixedRange)
        if (!newIntroRange.isEqual(introRange)) {
            introRange = newIntroRange
        }

        const newAutocompleteRange = updateRangeMultipleChanges(
            autocompleteRange,
            changes,
            {},
            updateFixedRange
        )
        if (!newAutocompleteRange.isEqual(autocompleteRange)) {
            autocompleteRange = newAutocompleteRange
        }

        const newEditrange = updateRangeMultipleChanges(editRange, changes, {}, updateFixedRange)
        if (!newEditrange.isEqual(editRange)) {
            editRange = newEditrange
        }
    })

    /**
     * Listen for cursor updates in the tutorial text document,
     * so we can automatically trigger a completion when the user
     * clicks on the intended line.
     * This is intended as a shortcut to typical completions without
     * requiring the user to actually start typing.
     */
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

    /**
     * Listen to __any__ changes in the interactive text document, so we can
     * check to see if the user has made any progress on the tutorial tasks.
     *
     * If the user has modified any of the interactive lines, then we mark
     * that line as complete.
     */
    const listenForSuccess = vscode.workspace.onDidChangeTextDocument(async ({ document }) => {
        if (document.uri !== interactiveDoc.uri) {
            return
        }

        // We don't actually care about the changes here, we just want to inspect our tracked
        // lines to see if they are still empty. If they are not, they we can report success
        const completeRanges = []
        const todoRanges = []
        for (const range of [introRange, autocompleteRange, editRange]) {
            if (document.getText(range).trim().length > 0) {
                completeRanges.push(range)
            } else {
                todoRanges.push(range)
            }
        }
        interactiveEditor.setDecorations(TODO_DECORATION, todoRanges)
        interactiveEditor.setDecorations(COMPLETE_DECORATION, completeRanges)
    })

    disposables.push(
        listenForInteractiveLineRangeUpdates,
        listenForAutocomplete,
        listenForSuccess,
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
