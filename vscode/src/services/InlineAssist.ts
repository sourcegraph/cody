import * as vscode from 'vscode'

/**
 * Create selection range for a single line
 * This is used for display the Cody icon and Code action on top of the first line of selected code
 */
export function getSingleLineRange(line: number): vscode.Range {
    return new vscode.Range(line, 0, line, 0)
}
