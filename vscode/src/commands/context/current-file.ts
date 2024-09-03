import {
    type ContextItem,
    ContextItemSource,
    contextFiltersProvider,
    logError,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'

export async function getContextFileFromCurrentFile(): Promise<ContextItem | null> {
    return wrapInActiveSpan('commands.context.file', async span => {
        try {
            const editor = getEditor()
            const document = editor?.active?.document
            if (!document) {
                throw new Error('No active editor')
            }

            if (await contextFiltersProvider.instance!.isUriIgnored(document.uri)) {
                return null
            }

            return {
                type: 'file',
                uri: document.uri,
                source: ContextItemSource.Editor,
            }
        } catch (error) {
            logError('getContextFileFromCurrentFile', 'failed', { verbose: error })
            return null
        }
    })
}
