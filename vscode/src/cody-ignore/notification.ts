import type { IsIgnored } from '@sourcegraph/cody-shared'
import { isError } from 'lodash'
import * as vscode from 'vscode'

/**
 * Enterprise only.
 * Filtered context out by cody.contextFilters Enterprise configuration setting.
 */
export type CodyIgnoreFeature = 'command' | 'edit' | 'test' | 'autocomplete'

export function ignoreReason(isIgnore: IsIgnored): string | null {
    if (isError(isIgnore)) {
        return isIgnore.message
    }

    switch (isIgnore) {
        case false:
            return null
        case 'non-file-uri':
            return 'This current file is ignored as it does not have a valid file URI.'
        case 'no-repo-found':
            return 'This current file is ignored as it is not in known git repository.'
        case 'has-ignore-everything-filters':
            return 'Your administrator has disabled Cody for this file.'
        default:
            if (isIgnore.startsWith('repo:')) {
                return `Your administrator has disabled Cody for '${isIgnore.replace('repo:', '')}'.`
            }
            return 'The current file is ignored by Cody.'
    }
}

export async function showCodyIgnoreNotification(
    feature: CodyIgnoreFeature,
    isIgnored: IsIgnored
): Promise<void> {
    const prefix =
        feature === 'autocomplete'
            ? 'Failed to generate autocomplete'
            : feature === 'edit'
              ? 'Edit failed to run'
              : feature === 'test'
                ? 'Failed to generate test'
                : 'Command failed to run'

    vscode.window.showErrorMessage(`${prefix}: ${ignoreReason(isIgnored)}`)
}
