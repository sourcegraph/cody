import * as JetBrainsThemeMap from './jetbrains.json'

const jetbrainsThemeMap = JetBrainsThemeMap as { [key: string]: string }

export function getJetBrainsThemeString(theme: string): string {
    try {
        // Parse the JSON string into an object
        const userTheme = JSON.parse(theme) as { [key: string]: string }

        // Generate CSS variable declarations using the mapping
        const cssVariables = Object.entries(userTheme)
            .map(([key, value]) => `${jetbrainsThemeMap[key]}: ${value};`)
            .join(' ')

        return cssVariables.replaceAll('--vscode', '--jetbrains')
    } catch {
        // Cannot parse the theme string
        return ''
    }
}
