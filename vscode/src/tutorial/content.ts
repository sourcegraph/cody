import dedent from 'dedent'
import * as vscode from 'vscode'
import { findRangeOfText } from './utils'

export type TutorialStepKey = 'autocomplete' | 'edit' | 'fix' | 'chat'

export const getStepContent = (step: TutorialStepKey): string => {
    let stepContent = ''
    switch (step) {
        case 'autocomplete':
            stepContent = dedent`
                ### Welcome to Cody!
                """
                Learn how to use Cody to write, edit and fix code by
                completing the 4 tasks below.
                """

                ### Task 1 of 4: Autocomplete
                """
                Place your cursor at the end of the following
                function and press tab to accept the
                Cody-powered autocomplete.
                """

                def hello_world():
                    """Prints hello world (with an emoji)"""
                    p
                #    ^ Autocomplete: Place cursor above
                # When you see a suggestion, press Tab to accept
                # or Opt+\ to generate another.
            `
            break
        case 'edit':
            stepContent = dedent`
                \n\n
                ### Task 2 of 4: Edit Code with instructions
                """
                Place the cursor on the empty line below,
                and press Opt+K to open the Edit Code input.
                We've pre-filled the instruction,
                all you need to do is choose Submit.
                """

                # ^ Edit: Place cursor above and press Opt+K
            `
            break
        case 'fix':
            stepContent = dedent`
                \n\n
                ### Task 3 of 4: Ask Cody to Fix
                """
                The following code has a bug. Place the cursor
                under the word with the wavy underline,
                click the lightbulb (or hit Cmd+.), and ask
                Cody to fix it for you:
                """
                def log_fruits():
                    print("List of fruits:", "apple,", "banana,", "cherry")
                #         ^ Fix: Place cursor anywhere here, press Cmd+., and "Ask Cody to Fix"
            `
            break
        case 'chat':
            stepContent = dedent`
                \n\n
                ### Task 4 of 4: Start a chat
                #
                # Start a Chat (Opt+L)
            `
    }

    return process.platform === 'darwin'
        ? stepContent
        : stepContent.replace('Opt', 'Alt').replace('Cmd', 'Ctrl')
}

interface BaseTutorialStep {
    key: TutorialStepKey
    range: vscode.Range
}
interface OnChangeTutorialStep extends BaseTutorialStep {
    range: vscode.Range
    originalText: string
    type: 'onTextChange'
}
interface ManualTutorialStep extends BaseTutorialStep {
    range: vscode.Range
    type: 'manual'
}
export type TutorialStep = OnChangeTutorialStep | ManualTutorialStep

export const getStepData = (document: vscode.TextDocument, step: TutorialStepKey): TutorialStep => {
    switch (step) {
        case 'autocomplete': {
            const autocompleteLine = findRangeOfText(document, '^ Autocomplete:')!.start.line - 1
            const autocompleteRange = new vscode.Range(
                new vscode.Position(autocompleteLine, 0),
                new vscode.Position(autocompleteLine, Number.MAX_SAFE_INTEGER)
            )
            return {
                key: 'autocomplete',
                range: autocompleteRange,
                originalText: document.getText(autocompleteRange).trim(),
                type: 'onTextChange',
            }
        }
        case 'edit': {
            const editLine = findRangeOfText(document, '^ Edit:')!.start.line - 1
            return {
                key: 'edit',
                range: new vscode.Range(
                    new vscode.Position(editLine, 0),
                    new vscode.Position(editLine, Number.MAX_SAFE_INTEGER)
                ),
                type: 'manual',
            }
        }
        case 'fix': {
            const fixLine = findRangeOfText(document, '^ Fix:')!.start.line - 1
            // The fix range already has characters, so limit this to the actual text in the line
            const fixRange = new vscode.Range(
                new vscode.Position(fixLine, document.lineAt(fixLine).firstNonWhitespaceCharacterIndex),
                new vscode.Position(fixLine, Number.MAX_SAFE_INTEGER)
            )
            return {
                key: 'fix',
                range: fixRange,
                originalText: document.getText(fixRange).trim(),
                type: 'onTextChange',
            }
        }
        case 'chat': {
            const chatLine = findRangeOfText(document, 'Start a Chat')!.start.line
            return {
                key: 'chat',
                range: new vscode.Range(
                    new vscode.Position(chatLine, 0),
                    new vscode.Position(chatLine, Number.MAX_SAFE_INTEGER)
                ),
                type: 'manual',
            }
        }
    }
}

export const getNextStep = (step: TutorialStepKey): TutorialStepKey | null => {
    switch (step) {
        case 'autocomplete':
            return 'edit'
        case 'edit':
            return 'fix'
        case 'fix':
            return 'chat'
        case 'chat':
            return null
    }
}
