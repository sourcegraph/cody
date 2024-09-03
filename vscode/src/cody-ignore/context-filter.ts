import { type IsIgnored, contextFiltersProvider } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { type CodyIgnoreFeature, showCodyIgnoreNotification } from './notification'

export async function isUriIgnoredByContextFilterWithNotification(
    uri: vscode.Uri,
    feature: CodyIgnoreFeature
): Promise<IsIgnored> {
    const isIgnored = await contextFiltersProvider.instance!.isUriIgnored(uri)
    if (isIgnored) {
        showCodyIgnoreNotification(feature, 'context-filter')
    }
    return isIgnored
}
