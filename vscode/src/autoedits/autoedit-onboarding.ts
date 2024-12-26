
import * as vscode from 'vscode'

export async function showAutoeditOnboarding(): Promise<void> {
    const selection = await vscode.window.showInformationMessage(
        '✨ Try Cody Autoedits - An alternative to autocomplete that helps you edit code more efficiently',
        'Enable Autoedits'
    )

    if (selection === 'Enable Autoedits') {
        // Enable the setting programmatically
        await vscode.workspace.getConfiguration().update(
            'cody.experimental.autoedits.enabled',
            true,
            vscode.ConfigurationTarget.Global
        )

        // Open VS Code settings UI and focus on the Cody Autoedits setting
        await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'cody.experimental.autoedits'
        )
    }
}


