import * as vscode from 'vscode'

export function trimPredictionToLastFullLine(prediction: string): string {
    if (!prediction) {
        return prediction
    }

    // If the prediction ends with a newline, it's already complete
    if (prediction.endsWith('\n')) {
        return prediction
    }

    const lastNewlineIndex = prediction.lastIndexOf('\n')
    if (lastNewlineIndex === -1) {
        // If there's no newline, we can't trim to a complete line
        return ''
    }

    // Return everything up to and including the last newline
    return prediction.substring(0, lastNewlineIndex + 1)
}

export function isHotStreakEnabledInSettings() {
    return vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.autoedit.use-hot-streak', false)
}
