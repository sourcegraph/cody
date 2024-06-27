import { CodyIDE } from '..'
import { jetbrainsTestTheme } from './data'
import { getJetBrainsThemeString } from './jetbrains'

// QUESTION: Should the theme be passed as a configuration option,
// or should it be sent to SimpleChatPanel as a webview message from the Agent?

/**
 * NOTE: Right now this implementation expects the theme to be passed as a configuration
 * option by the Agent. This should also be called whenever the theme has been changed.
 *
 * Generates the webview styles for the current IDE and theme.
 *
 * @param theme - The theme to use for the webview styles.
 * @returns {Promise<string | undefined>} A promise that resolves to the webview styles as a string,
 * or undefined if the IDE is not supported.
 */
export async function getWebviewThemeByIDE(IDE: CodyIDE, theme: string): Promise<string | undefined> {
    if (!theme.length) {
        return undefined
    }
    switch (IDE) {
        case CodyIDE.JetBrains:
            // TODO: Replace jetbrainsTestTheme with the actual theme.
            return getJetBrainsThemeString(theme || jetbrainsTestTheme)
        default:
            return undefined
    }
}
