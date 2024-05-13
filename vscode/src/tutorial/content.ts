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
                Learn how to use Cody to write, edit and fix code by completing the 4 tasks below.
                """

                ### Task 1 of 4: Autocomplete
                """
                Place your cursor at the end of the following function and press tab to accept the Cody-powered autocomplete.
                """
                def greet(name, surname):
                    """Greets a user with a simple message"""
                    
                #    ^ Autocomplete: Place cursor above
                # When you see a suggestion, press Tab to accept or Opt+\ to generate another.
            `
            break
        case 'edit':
            stepContent = dedent`
                \n\n
                ### Task 2 of 4: Edit Code with instructions
                """
                Place the cursor on the empty line below, and press Opt+K to open the Edit Code input.
                We've pre-filled the instruction, all you need to do is choose Submit.
                """

                # ^ Start an Edit (Opt+K)
            `
            break
        case 'fix':
            stepContent = dedent`
                \n\n
                ### Task 3 of 4: Ask Cody to Fix
                """
                The following code has a bug. Hover over the text with the error,
                select "Quick Fix" and then "Ask Cody to Fix".
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
    originalText: string
    type: 'onTextChange'
}
interface ManualTutorialStep extends BaseTutorialStep {
    type: 'manual'
}
export type TutorialStep = OnChangeTutorialStep | ManualTutorialStep

export const getStepData = (
    document: vscode.TextDocument,
    step: TutorialStepKey
): TutorialStep | null => {
    switch (step) {
        case 'autocomplete': {
            const triggerText = findRangeOfText(document, '^ Autocomplete:')
            if (!triggerText) {
                return null
            }
            const autocompleteRange = new vscode.Range(
                new vscode.Position(triggerText.start.line - 1, 0),
                new vscode.Position(triggerText.start.line - 1, Number.MAX_SAFE_INTEGER)
            )
            return {
                key: 'autocomplete',
                range: autocompleteRange,
                originalText: document.getText(autocompleteRange).trim(),
                type: 'onTextChange',
            }
        }
        case 'edit': {
            const triggerText = findRangeOfText(document, 'Start an Edit')
            if (!triggerText) {
                return null
            }
            const editLine = triggerText.start.line - 1
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
            const triggerText = findRangeOfText(document, '^ Fix:')
            if (!triggerText) {
                return null
            }
            const fixLine = triggerText.start.line - 1
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
            const triggerText = findRangeOfText(document, 'Start a Chat')
            if (!triggerText) {
                return null
            }
            const chatLine = triggerText.start.line
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

export const initTutorialDocument = async (uri: vscode.Uri): Promise<vscode.TextDocument> => {
    const firstStep = getStepContent('autocomplete')
    await vscode.workspace.fs.writeFile(uri, Buffer.from(firstStep))
    return vscode.workspace.openTextDocument(uri)
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/**
 * We need to provide users with an option to reset the document, if incorrectly modified,
 * but VS Code doesn't provide an easy way to do this, as it doesn't allow an extension to purge
 * the document from the VS Code internal cache.
 *
 * Due to this, it means we can encounter a race condition where VS Code APIs still reference an old
 * document, whilst we are presenting a new one to the user. This causes issues especially when seeking and
 * tracking specific ranges in the document.
 */
export const resetDocument = async (uri: vscode.Uri): Promise<vscode.TextDocument> => {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', uri)
    await sleep(250)
    return initTutorialDocument(uri)
}
