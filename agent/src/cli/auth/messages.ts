import type { Ora } from 'ora'

export function notLoggedIn(spinner: Ora): void {
    spinner.fail('Not logged in. To fix this problem, run:\n\tcody auth login --web')
}
