import { CodyIDE } from '../configuration'

/**
 * Returns a known referral code to use based on the current VS Code environment.
 * IMPORTANT: The code must be registered in the server-side referral code mapping:
 * @link client/web/src/user/settings/accessTokens/UserSettingsCreateAccessTokenCallbackPage.tsx
 * Use "CODY" as the default referral code for fallback.
 */
export function getCodyAuthReferralCode(ideName: CodyIDE, uriScheme?: string): string | undefined {
    const referralCodes: Record<CodyIDE, string> = {
        [CodyIDE.JetBrains]: 'JETBRAINS',
        [CodyIDE.Neovim]: 'NEOVIM',
        [CodyIDE.Emacs]: 'CODY',
        [CodyIDE.VisualStudio]: 'VISUAL_STUDIO',
        [CodyIDE.Eclipse]: 'ECLIPSE',
        [CodyIDE.VSCode]: 'CODY',
        [CodyIDE.Web]: 'CODY',
    }

    if (ideName === CodyIDE.VSCode) {
        switch (uriScheme) {
            case 'vscode-insiders':
                return 'CODY_INSIDERS'
            case 'vscodium':
                return 'CODY_VSCODIUM'
            case 'cursor':
                return 'CODY_CURSOR'
        }
    }

    return referralCodes[ideName] || undefined
}
