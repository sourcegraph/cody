import * as vscode from 'vscode'

export type CodyIgnoreType = 'cody-ignore' | 'context-filter'

type PassiveNotificationFeature = 'autocomplete' | 'supercompletion'
const didShowPassiveNotificationForFeature: Set<string> = new Set()
/**
 * A passive notification should be used for features that do not require the
 * user to initiate them (e.g. Autocomplete, Supercompletion).
 *
 * Only one passive notification is shown per user session
 */
export async function passiveNotification(
    feature: PassiveNotificationFeature,
    type: CodyIgnoreType
): Promise<void> {
    // Do not notify on .cody/ignore matches
    if (type === 'cody-ignore') {
        return
    }

    if (!didShowPassiveNotificationForFeature.has(feature)) {
        didShowPassiveNotificationForFeature.add(feature)
        vscode.window.showInformationMessage(
            `${
                feature === 'autocomplete' ? 'Autocomplete' : 'Supercompletions'
            } disabled: file is ignored (due to cody.contextFilters Enterprise configuration setting)`
        )
    }
}

export async function activeNotification(
    feature: 'command' | 'edit' | 'test',
    type: CodyIgnoreType
): Promise<void> {
    vscode.window.showErrorMessage(
        `${
            feature === 'edit'
                ? 'Edit failed to run'
                : feature === 'test'
                  ? 'Failed to generate test'
                  : 'Command failed to run'
        }: file is ignored (${
            type === 'context-filter'
                ? 'due to cody.contextFilters Enterprise configuration setting'
                : 'due to your cody ignore config'
        })`
    )
}
