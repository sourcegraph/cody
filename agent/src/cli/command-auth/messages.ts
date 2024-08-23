import type { Ora } from 'ora'
import type { AuthenticationOptions } from './command-login'

export function notAuthenticated(spinner: Ora): void {
    if (!spinner.isSpinning) {
        return
    }
    spinner.fail('Not logged in. To fix this problem, run:\n\tcody auth login --web')
}

export function errorSpinner(spinner: Ora, error: Error, options: AuthenticationOptions): void {
    if (error.message.includes('Invalid access token')) {
        const createNewTokenURL = options.endpoint + '/user/settings/tokens/new?description=CodyCLI'
        spinner.fail(
            'The provided access token is invalid. ' +
                'The most common cause for this is that the access token has expired. ' +
                `If you are using SRC_ACCESS_TOKEN, create a new token at ${createNewTokenURL} and update the value of SRC_ACCESS_TOKEN. ` +
                'If you are using `cody auth login --web`, run `cody auth logout` and try logging in again. '
        )
    } else {
        spinner.suffixText = error.stack ?? ''
        spinner.fail(error.message)
    }
}

export function unknownErrorSpinner(spinner: Ora, error: unknown, options: AuthenticationOptions): void {
    if (error instanceof Error) {
        errorSpinner(spinner, error, options)
    } else {
        spinner.fail(String(error))
    }
}
