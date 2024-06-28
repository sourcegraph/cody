import { describe, expect, it } from 'vitest'
import { CodyIDE } from '..'
import { getWebviewThemeByIDE } from './index'
import { getJetBrainsThemeString } from './jetbrains'

describe('getWebviewThemeByIDE', async () => {
    it('should return JetBrains theme string when IDE is JetBrains', async () => {
        const theme = 'dark'
        const result = await getWebviewThemeByIDE(CodyIDE.JetBrains, theme)
        expect(result).toBe(getJetBrainsThemeString(theme))
    })

    it('should return undefined for unsupported IDEs', async () => {
        const theme = 'dark'
        const result = await getWebviewThemeByIDE(CodyIDE.Emacs, theme)
        expect(result).toBe(undefined)
    })

    it('should return undefined for empty theme string', async () => {
        const theme = ''
        const result = await getWebviewThemeByIDE(CodyIDE.JetBrains, theme)
        expect(result).toBe(undefined)
    })

    it('should return undefined when IDE is VS Code', async () => {
        const result = await getWebviewThemeByIDE(CodyIDE.VSCode, '')
        // undefined so that it falls back to use the default theme.
        expect(result).toBe(undefined)
    })
})
