import * as vscode from 'vscode'

export type CodyIgnoreType = 'cody-ignore' | 'context-filter'
export type CodyIgnoreFeature = 'command' | 'edit' | 'test' | 'autocomplete'

export async function showCodyIgnoreNotification(
    feature: CodyIgnoreFeature,
    type: CodyIgnoreType
): Promise<void> {
    vscode.window.showErrorMessage(
        `${
            feature === 'autocomplete'
                ? 'Failed to generate autocomplete'
                : feature === 'edit'
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
