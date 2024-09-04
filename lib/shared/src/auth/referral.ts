import { CodyIDE } from '../configuration'

/**
 * Returns a known referral code to use based on the current VS Code environment.
 */
export function getCodyAuthReferralCode(ideName: CodyIDE, uriScheme?: string): string | undefined {
    const referralCodes: Record<CodyIDE, string> = {
        [CodyIDE.JetBrains]: 'CODY_JETBRAINS',
        [CodyIDE.Neovim]: 'CODY_NEOVIM',
        [CodyIDE.Emacs]: 'CODY_EMACS',
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
