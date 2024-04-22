import dedent from 'dedent'
import * as vscode from 'vscode'
import { findRangeOfText } from './utils'

export type TutorialStepType = 'autocomplete' | 'edit' | 'fix' | 'chat'

export const getStepContent = (step: TutorialStepType): string => {
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

                #   ^ Place cursor above
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

                # ^ Place cursor above and press Opt+K
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
                #         ^ Place cursor anywhere here, press Cmd+., and "Ask Cody to Fix"
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

export const getStepRange = (
    document: vscode.TextDocument,
    step: TutorialStepType
): { range: vscode.Range; originalText: string } | null => {
    switch (step) {
        case 'autocomplete': {
            const autocompleteLine = findRangeOfText(document, '^ Place cursor above')!.start.line - 1
            const autocompleteRange = new vscode.Range(
                new vscode.Position(autocompleteLine, 0),
                new vscode.Position(autocompleteLine, Number.MAX_SAFE_INTEGER)
            )
            return {
                /**
                 * The range of the target text that should be replaced during an autocomplete operation.
                 */
                /**
                 * The range of the target text to be used for the current tutorial step.
                 */
                range: autocompleteRange,
                originalText: document.getText(autocompleteRange).trim(),
            }
        }
        case 'edit': {
            // We don't track a range for edit, just that the command was successfully executed
            return null
        }
        case 'fix': {
            const fixLine = findRangeOfText(document, '^ Place cursor here and press')!.start.line - 1
            // The fix range already has characters, so limit this to the actual text in the line
            const fixRange = new vscode.Range(
                new vscode.Position(fixLine, document.lineAt(fixLine).firstNonWhitespaceCharacterIndex),
                new vscode.Position(fixLine, Number.MAX_SAFE_INTEGER)
            )
            return {
                range: fixRange,
                originalText: document.getText(fixRange).trim(),
            }
        }
        case 'chat': {
            // We don't track a range for chat, just that the command was successfully executed
            return null
        }
    }
}

export const getNextStep = (step: TutorialStepType): TutorialStepType | null => {
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
