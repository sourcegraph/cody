import * as vscode from 'vscode'

/**
 * A development helper that runs on activation to make the edit-debug loop easier by (e.g.) opening
 * the Cody sidebar automatically on launch.
 *
 * The following VS Code settings are respected. (They are not part of this extension's contributed
 * configuration JSON Schema, so they will not validate in your VS Code user settings file.)
 *
 * - `cody.dev.focusSidebarOnStartup`: boolean (or env var `CODY_FOCUS_SIDEBAR_ON_STARTUP`)
 * - `cody.dev.openAutocompleteTraceView`: boolean
 */
export function onActivationDevelopmentHelpers(): void {
    const settings = vscode.workspace.getConfiguration('cody.dev')

    if (settings.get('focusSidebarOnStartup') || process.env.CODY_FOCUS_SIDEBAR_ON_STARTUP) {
        void vscode.commands.executeCommand('cody.chat.focus')
    }

    if (settings.get('openAutocompleteTraceView')) {
        void vscode.commands.executeCommand('cody.autocomplete.openTraceView')
    }
}
