import * as vscode from 'vscode'

/**
 * Enterprise only.
 * Filtered context out by cody.contextFilters Enterprise configuration setting.
 */
export type CodyIgnoreType = 'context-filter'
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
        }: file is ignored (due to cody.contextFilters Enterprise configuration setting)`
    )
}
