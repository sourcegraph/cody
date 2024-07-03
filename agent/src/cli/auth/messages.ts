import type { Ora } from 'ora'

export function notLoggedIn(spinner: Ora): void {
    if (!spinner.isSpinning) {
        return
    }
    spinner.fail('Not logged in. To fix this problem, run:\n\tcody auth login --web')
}
