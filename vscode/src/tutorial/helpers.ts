import path from 'node:path'
import { FeatureFlag, featureFlagProvider, telemetryRecorder } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { logFirstEnrollmentEvent } from '../services/utils/enrollment-event'

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

// A/B testing logic for the interactive tutorial
// Ensure that the featureFlagProvider has the latest auth status,
// and then trigger the tutorial.
// This will either noop or open the tutorial depending on the feature flag.
export const maybeStartInteractiveTutorial = async () => {
    telemetryRecorder.recordEvent('cody.interactiveTutorial', 'attemptingStart')
    await featureFlagProvider.instance!.refresh()
    const enabled = await featureFlagProvider.instance!.evaluateFeatureFlag(
        FeatureFlag.CodyInteractiveTutorial
    )
    logFirstEnrollmentEvent(FeatureFlag.CodyInteractiveTutorial, enabled)
    if (!enabled) {
        return
    }
    return vscode.commands.executeCommand('cody.tutorial.start')
}
