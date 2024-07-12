import { contextFiltersProvider, isCodyIgnoredFile } from '@sourcegraph/cody-shared'
import { commands, window } from 'vscode'
import type { URI } from 'vscode-uri'
import type { CodyIgnoreType } from './notification'

export async function isCodyIgnored(uri: URI): Promise<null | CodyIgnoreType> {
    if (uri.scheme === 'file' && isCodyIgnoredFile(uri)) {
        return 'cody-ignore'
    }
    if (await contextFiltersProvider.isUriIgnored(uri)) {
        return 'context-filter'
    }
    return null
}

export const isCurrentFileIgnored = async (): Promise<CodyIgnoreType | null> => {
    const currentUri = window.activeTextEditor?.document?.uri
    const isIgnored = currentUri && (await isCodyIgnored(currentUri))
    commands.executeCommand('setContext', 'cody.currentFileIgnored', !!isIgnored)
    return isIgnored || null
}
