import path from 'node:path'
import * as vscode from 'vscode'

let tutorialDocumentUri: vscode.Uri

export const setTutorialUri = (context: vscode.ExtensionContext): vscode.Uri => {
    const tutorialPath = path.join(context.extensionUri.fsPath, 'walkthroughs', 'cody_tutorial.py')
    tutorialDocumentUri = vscode.Uri.file(tutorialPath)
    return tutorialDocumentUri
}

export const isInTutorial = (document: vscode.TextDocument): boolean => {
    if (!tutorialDocumentUri) {
        // Unknown tutorial URI, assume false
        return false
    }

    // True if the users target document matches our tutorial document
    return document.uri.toString() === tutorialDocumentUri.toString()
}
