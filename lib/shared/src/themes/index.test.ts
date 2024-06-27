import { describe, expect, it } from 'vitest'
import { CodyIDE } from '..'
import { getWebviewThemeByIDE } from './index'
import { getJetBrainsThemeString } from './jetbrains'

describe('getWebviewThemeByIDE', () => {
    it('should return JetBrains theme string when IDE is JetBrains', () => {
        const theme = 'dark'
        const result = getWebviewThemeByIDE(CodyIDE.JetBrains, theme)
        expect(result).toBe(getJetBrainsThemeString(theme))
    })

    it('should return an empty string for unsupported IDEs', () => {
        const theme = 'dark'
        const result = getWebviewThemeByIDE(CodyIDE.VSCode, theme)
        expect(result).toBe('')
    })

    it('should handle empty theme string', () => {
        const theme = ''
        const result = getWebviewThemeByIDE(CodyIDE.JetBrains, theme)
        expect(result).toBe(getJetBrainsThemeString(theme))
    })
})
